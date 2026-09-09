#!/usr/bin/env python3
"""Resumably seed a bounded multi-organization KMS dataset for load tests."""
import argparse, concurrent.futures, json, os, threading, time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

def call(url, token, method="GET", payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    for attempt in range(8):
        try:
            with urlopen(Request(url, data=body, headers=headers, method=method), timeout=60) as r:
                raw = r.read()
                return json.loads(raw) if raw else {}
        except (HTTPError, URLError):
            if attempt == 7: raise
            time.sleep(min(10, 0.25 * (2 ** attempt)))

def login(base, email, password):
    return call(f"{base}/api/v3/auth/login", "", "POST", {"email": email, "password": password})["accessToken"]

def select(base, access, org):
    return call(f"{base}/api/v3/auth/select-organization", access, "POST", {"organizationId": org, "userAgent": "cli"})["token"]

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--base-url", default=os.getenv("SEED_BASE_URL", "http://127.0.0.1:18080"))
    p.add_argument("--organizations", type=int, default=10)
    p.add_argument("--keys-per-organization", type=int, default=10000)
    p.add_argument("--workers", type=int, default=20)
    p.add_argument("--state", type=Path, default=Path("e2e/k6_bulk_seed_state.json"))
    args = p.parse_args()
    email, password = os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"]
    base = args.base_url.rstrip("/")
    access = login(base, email, password)
    state = json.loads(args.state.read_text()) if args.state.exists() else {"organizations": []}
    lock = threading.Lock()
    known = {o["name"]: o for o in state["organizations"]}
    for i in range(args.organizations):
        name = f"bench-kms-seed-{i:03d}"
        if name not in known:
            # Super-admin endpoint requires an org-scoped token.
            current = os.getenv("ORG_ID")
            if not current: raise SystemExit("ORG_ID is required")
            org_token = select(base, access, current)
            result = call(f"{base}/api/v1/admin/organization-management/organizations", org_token, "POST", {"name": name, "inviteAdminEmails": [email]})
            known[name] = {"name": name, "org_id": result["organization"]["id"], "project_id": None, "keys": []}
            state["organizations"] = list(known.values()); args.state.write_text(json.dumps(state, indent=2))
        org = known[name]
        token = select(base, access, org["org_id"])
        if not org.get("project_id"):
            project = call(f"{base}/api/v1/projects", token, "POST", {"projectName": f"kms-seed-{i:03d}", "type": "kms", "shouldCreateDefaultEnvs": False})["project"]
            org["project_id"] = project["id"]; state["organizations"] = list(known.values()); args.state.write_text(json.dumps(state, indent=2))
        existing = set(org.get("keys", [])); targets = [j for j in range(args.keys_per_organization) if j not in existing]
        def create(j):
            result = call(f"{base}/api/v1/kms/keys", token, "POST", {"projectId": org["project_id"], "name": f"kms-seed-{i:03d}-{j:05d}", "keyUsage": "sign-verify", "algorithm": "ECC_NIST_P256", "isExportable": False})
            return result["key"]["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
            for n, key_id in enumerate(pool.map(create, targets), 1):
                with lock: existing.add(key_id)
                if n % 100 == 0 or n == len(targets):
                    org["keys"] = list(existing); state["organizations"] = list(known.values()); args.state.write_text(json.dumps(state, indent=2))
                    print(f"{name}: {len(existing)}/{args.keys_per_organization}", flush=True)
    print(f"seeded {sum(len(o.get('keys', [])) for o in known.values())} keys across {len(known)} organizations")

if __name__ == "__main__": main()
