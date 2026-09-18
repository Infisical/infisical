#!/usr/bin/env python3
"""Temporary E2E and stress test for the Go KMS HTTP API."""

import argparse
import base64
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.request


def request(base, method, path, token=None, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{base.rstrip('/')}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"raw": raw}
        return exc.code, payload


def one_flow(base, token, project_id, suffix):
    name = f"e2e-go-{time.time_ns()}-{suffix}"[-32:]
    status, created = request(
        base,
        "POST",
        "/api-go/v1/kms/keys/",
        token,
        {
            "projectId": project_id,
            "name": name,
            "keyUsage": "sign-verify",
            "algorithm": "ECC_NIST_P256",
            "isExportable": False,
        },
    )
    if status != 200:
        raise RuntimeError(f"create: HTTP {status}: {created}")
    key = created.get("key", {})
    key_id = key.get("id")
    if not key_id:
        raise RuntimeError(f"create response missing key.id: {created}")

    data = base64.b64encode(f"kms-go-e2e-{suffix}".encode()).decode()
    sign_status, signed = request(
        base,
        "POST",
        f"/api-go/v1/kms/keys/{key_id}/sign",
        token,
        {"data": data, "signingAlgorithm": "ECDSA_SHA_256", "isDigest": False},
    )
    if sign_status != 200 or not signed.get("signature"):
        raise RuntimeError(f"sign: HTTP {sign_status}: {signed}")

    verify_status, verified = request(
        base,
        "POST",
        f"/api-go/v1/kms/keys/{key_id}/verify",
        token,
        {
            "data": data,
            "signature": signed["signature"],
            "signingAlgorithm": "ECDSA_SHA_256",
            "isDigest": False,
        },
    )
    if verify_status != 200 or verified.get("signatureValid") is not True:
        raise RuntimeError(f"verify: HTTP {verify_status}: {verified}")

    delete_status, deleted = request(
        base,
        "DELETE",
        f"/api-go/v1/kms/keys/{key_id}",
        token,
    )
    if delete_status != 200:
        raise RuntimeError(f"delete: HTTP {delete_status}: {deleted}")

    # A second delete must be a not-found response, proving the row was removed.
    second_delete_status, _ = request(
        base,
        "DELETE",
        f"/api-go/v1/kms/keys/{key_id}",
        token,
    )
    if second_delete_status != 404:
        raise RuntimeError(f"delete idempotency: expected HTTP 404, got {second_delete_status}")
    return key_id


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("API_GO_BASE_URL", "http://localhost:4040"))
    parser.add_argument("--stress", type=int, default=int(os.getenv("API_GO_STRESS", "20")))
    parser.add_argument("--workers", type=int, default=int(os.getenv("API_GO_WORKERS", "5")))
    args = parser.parse_args()
    token = os.getenv("API_GO_TOKEN")
    project_id = os.getenv("API_GO_PROJECT_ID")

    status, payload = request(args.base_url, "POST", "/api-go/v1/kms/keys/", body={})
    print(f"route probe: HTTP {status} {payload}")
    if not token or not project_id:
        print("Set API_GO_TOKEN and API_GO_PROJECT_ID to run authenticated create/sign/verify tests.")
        return 2 if status == 404 else 0

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(one_flow, args.base_url, token, project_id, i) for i in range(args.stress)]
        failures = []
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001 - report every stress failure
                failures.append(str(exc))
    elapsed = time.perf_counter() - started
    print(f"stress: {args.stress - len(failures)}/{args.stress} passed in {elapsed:.2f}s")
    if failures:
        print("first failures:")
        print("\n".join(failures[:10]))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
