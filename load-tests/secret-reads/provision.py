"""Create the two tenants the locustfile drives and write their credentials to a state file.

The attacker tenant gets a project whose dev:/bulk folder holds --secrets secrets, imported into prod:/, which
is the shape of the reported overload: every read of GET /api/v1/secret-imports/secrets/raw on prod:/ decrypts
all of them. The victim tenant is a separate organization with a handful of secrets, used to measure whether
the attacker's load spills over to tenants it has nothing to do with.

Users are created through email signup, reading the confirmation code from a MailHog API, so this only works
against an instance with self-signup on and a mail catcher (the local dev stack). Against any other instance,
create the identities by hand and pass them to the locustfile through the environment variables it documents.
"""

import argparse
import json
import re
import secrets
import string
import sys
import time

import requests

USER_AGENT = "infisical-load-test"
PASSWORD = "LoadTest-" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16)) + "!1"


class Api:
    def __init__(self, host: str):
        self.host = host.rstrip("/")
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    def call(self, method: str, path: str, token: str | None = None, expected=(200,), **kwargs):
        headers = kwargs.pop("headers", {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        for _ in range(20):
            resp = self.session.request(method, self.host + path, headers=headers, timeout=300, **kwargs)
            if resp.status_code == 429:
                time.sleep(float(resp.headers.get("Retry-After", "5")))
                continue
            if resp.status_code not in expected:
                raise RuntimeError(f"{method} {path} -> {resp.status_code}: {resp.text[:500]}")
            return resp.json() if resp.content else None
        raise RuntimeError(f"{method} {path} kept returning 429")


def confirmation_code(mailhog: str, email: str) -> str:
    for _ in range(30):
        resp = requests.get(f"{mailhog}/api/v2/search", params={"kind": "to", "query": email}, timeout=10)
        for item in resp.json().get("items", []):
            subject = " ".join(item["Content"]["Headers"].get("Subject", []))
            match = re.search(r"\b(\d{6})\b", subject) or re.search(r"\b(\d{6})\b", item["Content"].get("Body", ""))
            if match:
                return match.group(1)
        time.sleep(1)
    raise RuntimeError(f"no confirmation code for {email} in {mailhog}")


def sign_up(api: Api, mailhog: str, email: str, org_name: str) -> dict:
    api.call("POST", "/api/v3/signup/email/signup", json={"email": email})
    code = confirmation_code(mailhog, email)
    signup_token = api.call("POST", "/api/v3/signup/email/verify", json={"email": email, "code": code})["token"]
    api.call(
        "POST",
        "/api/v3/signup/complete-account",
        token=signup_token,
        json={"type": "email", "email": email, "firstName": "Load", "lastName": "Test", "password": PASSWORD,
              "organizationName": org_name},
    )
    login_token = api.call("POST", "/api/v3/auth/login", json={"email": email, "password": PASSWORD})["accessToken"]
    orgs = api.call("GET", "/api/v1/organization", token=login_token)["organizations"]
    org_id = next(o["id"] for o in orgs if o["name"] == org_name)
    token = api.call("POST", "/api/v3/auth/select-organization", token=login_token,
                     json={"organizationId": org_id})["token"]
    return {"email": email, "password": PASSWORD, "orgId": org_id, "token": token}


def create_identity(api: Api, token: str, org_id: str, project_id: str, name: str) -> dict:
    identity = api.call("POST", "/api/v1/identities", token=token,
                        json={"name": name, "organizationId": org_id, "role": "member"})["identity"]
    ua = api.call("POST", f"/api/v1/auth/universal-auth/identities/{identity['id']}", token=token, json={})
    client_secret = api.call("POST", f"/api/v1/auth/universal-auth/identities/{identity['id']}/client-secrets",
                             token=token, json={})["clientSecret"]
    api.call("POST", f"/api/v1/projects/{project_id}/identity-memberships/{identity['id']}", token=token,
             json={"role": "admin"})
    return {"id": identity["id"], "name": name, "clientId": ua["identityUniversalAuth"]["clientId"],
            "clientSecret": client_secret}


def identity_token(api: Api, identity: dict) -> str:
    return api.call("POST", "/api/v1/auth/universal-auth/login",
                    json={"clientId": identity["clientId"], "clientSecret": identity["clientSecret"]})["accessToken"]


def create_project(api: Api, token: str, name: str) -> str:
    return api.call("POST", "/api/v1/projects", token=token,
                    json={"projectName": name, "type": "secret-manager"})["project"]["id"]


def seed_secrets(api: Api, token: str, project_id: str, environment: str, path: str, count: int, batch: int,
                 value_len: int, prefix: str):
    created = 0
    started = time.time()
    while created < count:
        size = min(batch, count - created)
        api.call("POST", "/api/v4/secrets/batch", token=token, json={
            "projectId": project_id,
            "environment": environment,
            "secretPath": path,
            "secrets": [
                {"secretKey": f"{prefix}_{created + i:06d}",
                 "secretValue": "".join(secrets.choice(string.ascii_letters) for _ in range(value_len))}
                for i in range(size)
            ],
        })
        created += size
        print(f"  {path}: {created}/{count} secrets ({time.time() - started:.0f}s)", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="http://localhost:4000")
    parser.add_argument("--mailhog", default="http://localhost:8025")
    parser.add_argument("--secrets", type=int, default=10200, help="secrets in the attacker's dev:/bulk folder")
    parser.add_argument("--batch-size", type=int, default=500, help="secrets per POST /api/v4/secrets/batch")
    parser.add_argument("--value-length", type=int, default=200,
                        help="characters per secret value; 200 gives roughly the reported 4 MB per 10,200-secret read")
    parser.add_argument("--state", default="state.json")
    args = parser.parse_args()

    api = Api(args.host)
    run_id = secrets.token_hex(3)
    state = {"host": args.host, "runId": run_id}

    print("attacker tenant", file=sys.stderr)
    attacker = sign_up(api, args.mailhog, f"lt-attacker-{run_id}@example.com", f"lt-attacker-{run_id}")
    project_id = create_project(api, attacker["token"], f"lt-attacker-{run_id}")
    api.call("POST", "/api/v2/folders", token=attacker["token"],
             json={"projectId": project_id, "environment": "dev", "name": "bulk", "path": "/"})
    api.call("POST", "/api/v2/folders", token=attacker["token"],
             json={"projectId": project_id, "environment": "dev", "name": "small", "path": "/"})
    api.call("POST", "/api/v2/secret-imports", token=attacker["token"],
             json={"projectId": project_id, "environment": "prod", "path": "/",
                   "import": {"environment": "dev", "path": "/bulk"}})
    readers = [create_identity(api, attacker["token"], attacker["orgId"], project_id, f"lt-attacker-reader-{n}")
               for n in (1, 2)]
    seed_token = identity_token(api, readers[0])
    seed_secrets(api, seed_token, project_id, "dev", "/small", 20, 20, args.value_length, "SMALL")
    seed_secrets(api, seed_token, project_id, "dev", "/bulk", args.secrets, args.batch_size, args.value_length, "BULK")
    state["attacker"] = {**attacker, "projectId": project_id, "identities": readers}

    print("victim tenant", file=sys.stderr)
    victim = sign_up(api, args.mailhog, f"lt-victim-{run_id}@example.com", f"lt-victim-{run_id}")
    victim_project = create_project(api, victim["token"], f"lt-victim-{run_id}")
    victim_identity = create_identity(api, victim["token"], victim["orgId"], victim_project, "lt-victim-app")
    seed_secrets(api, identity_token(api, victim_identity), victim_project, "dev", "/", 20, 20, args.value_length,
                 "VICTIM")
    state["victim"] = {**victim, "projectId": victim_project, "identities": [victim_identity]}

    for tenant in ("attacker", "victim"):
        state[tenant].pop("token")
    with open(args.state, "w") as f:
        json.dump(state, f, indent=2)
    print(f"wrote {args.state}", file=sys.stderr)


if __name__ == "__main__":
    main()
