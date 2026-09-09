#!/usr/bin/env python3
"""Create a resumable 1,000-project KMS inventory for k6."""
import argparse
import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DATA = "aW5maXNpY2FsLWs2LXN0ZWFkeS1zdGF0ZS1wYXlsb2Fk"

def request_json(url, method="GET", payload=None, token=None):
    body = json.dumps(payload).encode() if payload is not None else None
    headers = {"User-Agent": "infisical-k6-seeder/1.0"}
    if body: headers["Content-Type"] = "application/json"
    if token: headers["Authorization"] = f"Bearer {token}"
    with urlopen(Request(url, data=body, headers=headers, method=method), timeout=30) as response:
        return json.loads(response.read())

def retry(call):
    for attempt in range(8):
        try: return call()
        except (HTTPError, URLError):
            if attempt == 7: raise
            time.sleep(min(10, 0.25 * 2 ** attempt))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--projects", type=int, default=1000)
    parser.add_argument("--output", type=Path, default=Path("e2e/k6_kms_inventory.json"))
    parser.add_argument("--org-id", default=os.getenv("ORG_ID"))
    args = parser.parse_args()
    if args.projects < 10: raise SystemExit("--projects must be at least 10")
    email, password = os.getenv("ADMIN_EMAIL"), os.getenv("ADMIN_PASSWORD")
    if not email or not password or not args.org_id: raise SystemExit("ADMIN_EMAIL, ADMIN_PASSWORD, and ORG_ID are required")
    base = args.base_url.rstrip("/")
    token = retry(lambda: request_json(f"{base}/api/v3/auth/login", "POST", {"email": email, "password": password}))["accessToken"]
    token = retry(lambda: request_json(f"{base}/api/v3/auth/select-organization", "POST", {"organizationId": args.org_id, "userAgent": "cli"}, token))["token"]
    existing = json.loads(args.output.read_text()).get("entries", []) if args.output.exists() else []
    entries = {entry["projectIndex"]: entry for entry in existing}
    for index in range(args.projects):
        if index in entries: continue
        project = retry(lambda: request_json(f"{base}/api/v1/projects", "POST", {"projectName": f"k6-project-{index:04d}", "type": "kms", "shouldCreateDefaultEnvs": False}, token))["project"]
        key = retry(lambda: request_json(f"{base}/api/v1/kms/keys", "POST", {"projectId": project["id"], "name": f"k6-key-{index:04d}", "keyUsage": "sign-verify", "algorithm": "ECC_NIST_P256", "isExportable": False}, token))["key"]
        signature = retry(lambda: request_json(f"{base}/api/v1/kms/keys/{key['id']}/sign", "POST", {"data": DATA, "signingAlgorithm": "ECDSA_SHA_256", "isDigest": False}, token))["signature"]
        entries[index] = {"projectIndex": index, "projectId": project["id"], "keyId": key["id"], "data": DATA, "signature": signature}
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"entries": [entries[i] for i in sorted(entries)]}, indent=2))
        print(f"seeded {index + 1}/{args.projects}")

if __name__ == "__main__": main()
