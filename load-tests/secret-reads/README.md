# Secret read load test

A [Locust](https://locust.io) suite for the overload reported against the secret read routes: one tenant
fills a folder with about 10,000 secrets, then reads it back through `GET /api/v1/secret-imports/secrets/raw`
from 100 concurrent clients until login and `/api/status` start failing for every other tenant. It measures
whether an unrelated tenant (the victim) keeps getting answers while the attack runs, and how the attacker's
requests are refused.

Never point it at Infisical Cloud or at an instance other people use without approval from whoever runs it.

## Setup

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
```

## Create the tenants

`provision.py` signs up an attacker and a victim user (each with its own organization, project and machine
identities), seeds the attacker's `dev:/bulk` folder, imports it into `prod:/`, and writes the credentials to a
state file.

```bash
python provision.py --host http://localhost:4000 --state state.json --secrets 10200
```

It signs users up through email, reading the confirmation code from the MailHog API of the local dev stack
(`--mailhog http://localhost:8025`), so the instance needs self-signup on (Admin Console, or
`update super_admin set "allowSignUp" = true` and `redis-cli del infisical-admin-cfg`). To use existing
tenants instead, write `state.json` by hand:

```json
{
  "attacker": {
    "projectId": "<project with dev:/bulk (10k secrets), dev:/small (20 secrets), and prod:/ importing dev:/bulk>",
    "identities": [
      { "name": "reader-1", "clientId": "<universal auth client ID>", "clientSecret": "<client secret>" },
      { "name": "reader-2", "clientId": "<second identity of the same organization>", "clientSecret": "<...>" }
    ]
  },
  "victim": {
    "email": "<user of another organization>",
    "password": "<password>",
    "projectId": "<project with a few secrets in dev:/>",
    "identities": [{ "name": "victim-app", "clientId": "<...>", "clientSecret": "<...>" }]
  }
}
```

## Run a scenario

Run the attacker and the victim probe as two separate Locust processes. A load generator that is busy
reading multi-megabyte responses would otherwise delay the victim's requests and inflate their latencies.

```bash
export LT_STATE=state.json
# the victim: 3 users, each sending one request a second
locust -f locustfile.py --host http://localhost:4000 --headless -u 3 -r 3 -t 200s VictimProbe --csv results/victim &
# the attack, the shape of the report: 100 concurrent readers for 150 seconds
locust -f locustfile.py --host http://localhost:4000 --headless -u 100 -r 50 -t 150s SecretImportFlooder \
  --processes 2 --csv results/attack
```

| Scenario | User classes | What it shows |
| --- | --- | --- |
| Reported attack | `SecretImportFlooder` | Import reads of the 10k-secret folder, back to back, with no ETag |
| Cache busting | `SecretImportFlooder CacheBuster` | The same, while one secret is rewritten every second so every cached read and ETag misses |
| Folder lists | `SecretListFlooder` | The same load on `GET /api/v4/secrets` and `GET /api/v3/secrets/raw` |
| Polling with ETags | `ConditionalImportReader` | Clients that resend `If-None-Match` and get `304` |
| Cloud rate limits | `HotActor SecondActor` with `LT_SPOOF_IPS=1` | Per-actor and per-org secrets limits; see below |
| Victim | `VictimProbe` | `GET /api/status`, universal auth login, password login, a 20-secret read |

The victim process exits with code 1 when more than `LT_VICTIM_MAX_FAIL_RATIO` (default 1%) of its requests
fail, where a request slower than `LT_VICTIM_TIMEOUT_MS` (default 5000) counts as failed. A victim request
still unanswered after `LT_VICTIM_CLIENT_TIMEOUT_S` (default 10) is abandoned and counted as failed, so an
instance that stops answering shows up as failures rather than as missing requests. Attacker refusals
(`429`, `503`) appear in the failures table with the server's `Retry-After`, but never fail the run. Set
`LT_SUMMARY=<file>.json` for status codes, refusal messages and `Retry-After` values per route, and
`LT_REQUEST_LOG=<prefix>` for a CSV of every request, to cut the results to the attack window.

## Server settings that change the outcome

The concurrency limiter on secret reads is off unless `SECRET_READ_CONCURRENCY_LIMIT_ENABLED=true`. Its other
settings are `SECRET_READ_MAX_IN_FLIGHT_PER_ORG`, `SECRET_READ_MAX_IN_FLIGHT`,
`SECRET_READ_MAX_QUEUE_WAIT_MS` and `SECRET_READ_MAX_QUEUE_DEPTH` (see
`docs/self-hosting/configuration/envars.mdx`). It keeps its state in each instance's memory, so with several
replicas the limits add up.

Rate limits of any kind only run when the instance is in production mode on Infisical Cloud. To try the
per-actor and per-org secrets limits on a local instance, start it with `NODE_ENV=production`,
`LICENSE_SERVER_V2_SERVICE_KEY` set to any value, and `SECRETS_RATE_LIMIT_ENABLED=true`. The per-IP limits
are checked first and are lower, so set `LT_SPOOF_IPS=1` to give every simulated user its own
`X-Forwarded-For` (this works when `TRUSTED_PROXY_CIDRS` is unset). Keep each user under the per-IP secrets
limit, for example `LT_HOT_RPS=0.5` with 6 `HotActor` users and `LT_SECOND_RPS=0.6`.
