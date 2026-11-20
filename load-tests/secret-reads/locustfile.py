"""Load test for the secret read paths that let one tenant take an instance down (PR 9716, feat/secrets-966).

The attacker tenant reads a folder of ~10k secrets over and over; the victim tenant, a different organization,
keeps checking that the instance still answers it. Pick a scenario by naming user classes on the command line:

  overload   SecretImportFlooder               the reported attack on GET /api/v1/secret-imports/secrets/raw
  bust       SecretImportFlooder CacheBuster   the same, with one secret rewritten every second so no read is cached
  list       SecretListFlooder                 the same load on GET /api/v4/secrets and GET /api/v3/secrets/raw
  etag       ConditionalImportReader           pollers that resend the ETag they were given (If-None-Match)
  ratelimit  HotActor SecondActor              per-actor and per-org secrets rate limits (Infisical Cloud only)
  victim     VictimProbe                       the unrelated tenant: status, logins and a small secret read

Run VictimProbe in its own locust process next to the attacker one, so a load generator busy reading
multi-megabyte responses does not inflate the victim's latencies:

  LT_STATE=state.json locust -f locustfile.py --headless -u 100 -r 50 -t 150s SecretImportFlooder \\
      --processes 2 --csv results/attack
  LT_STATE=state.json locust -f locustfile.py --headless -u 3 -r 3 -t 150s VictimProbe --csv results/victim

Settings (environment variables):
  LT_STATE                  credentials file written by provision.py (default ./state.json)
  LT_VICTIM_TIMEOUT_MS      a victim request slower than this counts as failed (default 5000)
  LT_VICTIM_MAX_FAIL_RATIO  exit 1 when more victim requests than this fail (default 0.01)
  LT_VICTIM_CLIENT_TIMEOUT_S  a victim request still unanswered after this is abandoned and counted as
                            failed (default 10), so a hung instance shows up as failures, not silence
  LT_SPOOF_IPS              1 gives every simulated user its own X-Forwarded-For, so per-IP limits on an
                            instance without TRUSTED_PROXY_CIDRS do not hide the per-actor and per-org ones
  LT_HOT_RPS, LT_SECOND_RPS requests per second per HotActor / SecondActor user (default 10 / 1)
  LT_SUMMARY                path for a JSON summary with status codes, refusal messages and Retry-After values
  LT_REQUEST_LOG            path prefix for a per-process CSV of every request: end time, name, status,
                            latency ms, exception flag (for cutting results to the attack window)

Attacker refusals (429/503) show up as failures carrying the server's message, but never fail the run.
"""

import itertools
import json
import os
import random
import string
import threading
import time
from collections import Counter, defaultdict

from locust import FastHttpUser, HttpUser, constant, constant_pacing, constant_throughput, events, task
from locust.runners import MasterRunner

STATE = json.load(open(os.environ.get("LT_STATE", os.path.join(os.path.dirname(__file__), "state.json"))))
VICTIM_TIMEOUT_MS = float(os.environ.get("LT_VICTIM_TIMEOUT_MS", "5000"))
VICTIM_CLIENT_TIMEOUT_S = float(os.environ.get("LT_VICTIM_CLIENT_TIMEOUT_S", "10"))
VICTIM_MAX_FAIL_RATIO = float(os.environ.get("LT_VICTIM_MAX_FAIL_RATIO", "0.01"))
SPOOF_IPS = os.environ.get("LT_SPOOF_IPS") == "1"
SUMMARY_PATH = os.environ.get("LT_SUMMARY")
REQUEST_LOG = os.environ.get("LT_REQUEST_LOG")
ATTACKER = STATE["attacker"]
VICTIM = STATE["victim"]
VICTIM_PREFIX = "victim: "

counters: dict[str, dict[str, Counter]] = defaultdict(lambda: defaultdict(Counter))
_ip_sequence = itertools.count(random.randrange(1, 1 << 20))
_tokens: dict[str, str] = {}
_token_lock = threading.Lock()


def next_client_ip() -> str:
    n = next(_ip_sequence)
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"


def identity_token(client, identity: dict, headers: dict | None = None) -> str:
    with _token_lock:
        if identity["clientId"] in _tokens:
            return _tokens[identity["clientId"]]
    with client.post("/api/v1/auth/universal-auth/login", name="setup: universal auth login", headers=headers or {},
                     json={"clientId": identity["clientId"], "clientSecret": identity["clientSecret"]},
                     catch_response=True) as resp:
        if resp.status_code != 200:
            resp.failure(f"login {resp.status_code}")
            raise RuntimeError(f"universal auth login for {identity['name']} returned {resp.status_code}")
        token = resp.json()["accessToken"]
    with _token_lock:
        _tokens[identity["clientId"]] = token
    return token


def record(name: str, resp) -> None:
    counters[name]["status"][str(resp.status_code)] += 1
    counters[name]["bytes"]["total"] += len(resp.content or b"")
    if resp.status_code in (429, 503):
        try:
            message = resp.json().get("message", "")
        except Exception:
            message = (resp.text or "")[:160]
        counters[name]["refusals"][f"{resp.status_code} {message[:200]}"] += 1
        counters[name]["retry_after"][str(resp.headers.get("Retry-After", "none"))] += 1


def classify_attacker(name: str, resp) -> None:
    record(name, resp)
    if resp.status_code in (200, 304):
        resp.success()
    elif resp.status_code in (429, 503):
        resp.failure(f"refused {resp.status_code} (Retry-After {resp.headers.get('Retry-After', 'none')})")
    else:
        resp.failure(f"unexpected {resp.status_code}: {(resp.text or '')[:160]}")


def folder_params(environment: str, path: str, version: str) -> dict:
    project = "projectId" if version == "v4" else "workspaceId"
    return {project: ATTACKER["projectId"], "environment": environment, "secretPath": path}


IMPORT_PARAMS = {"workspaceId": ATTACKER["projectId"], "environment": "prod", "path": "/"}


class _AttackerUser(FastHttpUser):
    abstract = True
    network_timeout = 120.0
    connection_timeout = 30.0
    identity_index = 0

    def on_start(self):
        self.headers = {"X-Forwarded-For": next_client_ip()} if SPOOF_IPS else {}
        token = identity_token(self.client, ATTACKER["identities"][self.identity_index], self.headers)
        self.headers["Authorization"] = f"Bearer {token}"


class SecretImportFlooder(_AttackerUser):
    """The reported attack: an import of the 10k-secret folder, read without If-None-Match, back to back."""

    wait_time = constant(0)

    @task
    def read_imports(self):
        name = "attacker: GET /api/v1/secret-imports/secrets/raw"
        with self.client.get("/api/v1/secret-imports/secrets/raw", name=name, headers=self.headers,
                             params=IMPORT_PARAMS, catch_response=True) as r:
            classify_attacker(name, r)


class CacheBuster(_AttackerUser):
    """Rewrites one secret of the imported folder every second, which moves the project's data version and so
    misses every cached read and stored ETag. A single user is enough."""

    fixed_count = 1
    wait_time = constant_pacing(1)

    @task
    def rewrite_secret(self):
        name = "attacker: PATCH /api/v4/secrets/:name (cache buster)"
        value = "".join(random.choices(string.ascii_letters, k=32))
        with self.client.patch("/api/v4/secrets/BULK_000000", name=name, headers=self.headers, catch_response=True,
                               json={**folder_params("dev", "/bulk", "v4"), "secretValue": value}) as r:
            classify_attacker(name, r)


class SecretListFlooder(_AttackerUser):
    """The same pressure on the two folder list routes the branch also puts behind the concurrency limiter."""

    wait_time = constant(0)

    @task
    def list_v4(self):
        name = "attacker: GET /api/v4/secrets"
        with self.client.get("/api/v4/secrets", name=name, headers=self.headers, catch_response=True,
                             params=folder_params("dev", "/bulk", "v4")) as r:
            classify_attacker(name, r)

    @task
    def list_v3_raw(self):
        name = "attacker: GET /api/v3/secrets/raw"
        with self.client.get("/api/v3/secrets/raw", name=name, headers=self.headers, catch_response=True,
                             params=folder_params("dev", "/bulk", "v3")) as r:
            classify_attacker(name, r)


class ConditionalImportReader(_AttackerUser):
    """A well-behaved poller (agent, operator, SDK cache) that resends the ETag it got last time."""

    wait_time = constant(0)

    def on_start(self):
        super().on_start()
        self.etag = None

    @task
    def read_imports(self):
        name = "attacker: GET /api/v1/secret-imports/secrets/raw (If-None-Match)"
        headers = {**self.headers, "If-None-Match": self.etag} if self.etag else self.headers
        with self.client.get("/api/v1/secret-imports/secrets/raw", name=name, headers=headers,
                             params=IMPORT_PARAMS, catch_response=True) as r:
            if r.status_code == 200 and r.headers.get("ETag"):
                self.etag = r.headers["ETag"]
            classify_attacker(name, r)


class _RateLimitActor(_AttackerUser):
    """Reads a 20-secret folder at a fixed rate, so the only thing that can refuse it is a rate limit."""

    abstract = True

    @task
    def list_small_folder(self):
        name = f"attacker identity {self.identity_index + 1}: GET /api/v4/secrets (20 secrets)"
        with self.client.get("/api/v4/secrets", name=name, headers=self.headers, catch_response=True,
                             params=folder_params("dev", "/small", "v4")) as r:
            classify_attacker(name, r)


class HotActor(_RateLimitActor):
    """One machine identity pushing past its per-actor budget."""

    identity_index = 0
    wait_time = constant_throughput(float(os.environ.get("LT_HOT_RPS", "10")))


class SecondActor(_RateLimitActor):
    """Another identity of the same organization, reading gently, to show when the org-wide tier kicks in."""

    identity_index = 1
    fixed_count = 1
    wait_time = constant_throughput(float(os.environ.get("LT_SECOND_RPS", "1")))


class VictimProbe(HttpUser):
    """An unrelated tenant: status checks, logins and a small secret read, once per second per user."""

    wait_time = constant_pacing(1)

    def on_start(self):
        self.identity = VICTIM["identities"][0]
        if SPOOF_IPS:
            self.client.headers["X-Forwarded-For"] = next_client_ip()

    def _check(self, resp, name: str) -> None:
        record(name, resp)
        elapsed_ms = resp.elapsed.total_seconds() * 1000 if resp.elapsed else 0
        if resp.status_code != 200:
            resp.failure(f"status {resp.status_code}")
        elif elapsed_ms > VICTIM_TIMEOUT_MS:
            resp.failure(f"slower than {VICTIM_TIMEOUT_MS:.0f} ms")
        else:
            resp.success()

    @task(4)
    def status(self):
        name = VICTIM_PREFIX + "GET /api/status"
        with self.client.get("/api/status", name=name, catch_response=True, timeout=VICTIM_CLIENT_TIMEOUT_S) as r:
            self._check(r, name)

    @task(2)
    def machine_login(self):
        name = VICTIM_PREFIX + "POST /api/v1/auth/universal-auth/login"
        with self.client.post("/api/v1/auth/universal-auth/login", name=name, catch_response=True,
                              timeout=VICTIM_CLIENT_TIMEOUT_S,
                              json={"clientId": self.identity["clientId"],
                                    "clientSecret": self.identity["clientSecret"]}) as r:
            self._check(r, name)

    @task(1)
    def user_login(self):
        name = VICTIM_PREFIX + "POST /api/v3/auth/login"
        with self.client.post("/api/v3/auth/login", name=name, catch_response=True, timeout=VICTIM_CLIENT_TIMEOUT_S,
                              json={"email": VICTIM["email"], "password": VICTIM["password"]}) as r:
            self._check(r, name)

    @task(2)
    def read_own_secrets(self):
        name = VICTIM_PREFIX + "GET /api/v4/secrets (20 secrets)"
        token = identity_token(self.client, self.identity)
        with self.client.get("/api/v4/secrets", name=name, catch_response=True, timeout=VICTIM_CLIENT_TIMEOUT_S,
                             headers={"Authorization": f"Bearer {token}"},
                             params={"projectId": VICTIM["projectId"], "environment": "dev", "secretPath": "/"}) as r:
            self._check(r, name)


_request_log = None


@events.request.add_listener
def _log_request(name, response_time, exception, response=None, **_kwargs):
    global _request_log
    if not REQUEST_LOG:
        return
    if _request_log is None:
        _request_log = open(f"{REQUEST_LOG}.{os.getpid()}.csv", "a", buffering=1)
    status = getattr(response, "status_code", 0) if response is not None else 0
    _request_log.write(f"{time.time():.3f},{name},{status},{response_time:.1f},{1 if exception else 0}\n")


def _drain_counters() -> dict:
    snapshot = {name: {kind: dict(c) for kind, c in kinds.items()} for name, kinds in counters.items()}
    counters.clear()
    return snapshot


def _merge_counters(snapshot: dict) -> None:
    for name, kinds in snapshot.items():
        for kind, values in kinds.items():
            counters[name][kind].update(values)


@events.report_to_master.add_listener
def _send_counters(client_id, data, **_kwargs):
    data["lt_counters"] = _drain_counters()


@events.worker_report.add_listener
def _receive_counters(client_id, data, **_kwargs):
    _merge_counters(data.get("lt_counters", {}))


@events.quitting.add_listener
def victim_gate(environment, **_kwargs):
    victim = [s for (name, _method), s in environment.stats.entries.items() if name.startswith(VICTIM_PREFIX)]
    if not victim:
        return
    total = sum(s.num_requests for s in victim)
    failures = sum(s.num_failures for s in victim)
    ratio = failures / total if total else 0.0
    environment.process_exit_code = 1 if ratio > VICTIM_MAX_FAIL_RATIO else 0
    print(f"victim requests: {total}, failed: {failures} ({ratio:.1%}), "
          f"gate {VICTIM_MAX_FAIL_RATIO:.1%} -> exit {environment.process_exit_code}")


@events.quitting.add_listener
def write_summary(environment, **_kwargs):
    if not SUMMARY_PATH or (environment.runner and not isinstance(environment.runner, MasterRunner)
                            and environment.parsed_options and environment.parsed_options.worker):
        return
    entries = {}
    for (name, _method), s in environment.stats.entries.items():
        kinds = counters.get(name, {})
        seen = sum(kinds.get("status", {}).values())
        entries[name] = {
            "requests": s.num_requests,
            "failures": s.num_failures,
            "rps": round(s.total_rps, 2),
            "avg_ms": round(s.avg_response_time, 1),
            "p50_ms": s.get_response_time_percentile(0.5),
            "p95_ms": s.get_response_time_percentile(0.95),
            "p99_ms": s.get_response_time_percentile(0.99),
            "max_ms": round(s.max_response_time or 0, 1),
            "statuses": dict(kinds.get("status", {})),
            "avg_bytes": round(kinds.get("bytes", {}).get("total", 0) / seen) if seen else 0,
            "refusals": dict(kinds.get("refusals", {})),
            "retry_after": dict(kinds.get("retry_after", {})),
        }
    with open(SUMMARY_PATH, "w") as f:
        json.dump({"finishedAt": time.time(), "host": environment.host, "entries": entries}, f, indent=2)
