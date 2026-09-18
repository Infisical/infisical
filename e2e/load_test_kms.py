    #!/usr/bin/env python3
"""Bounded KMS load test with latency percentiles.

Each flow creates a key, signs, verifies, and deletes it. This is intentionally
configurable because the draft's 1M/5M request profiles are too large for a
developer Docker stack without a controlled test window.
"""

import argparse
import base64
import concurrent.futures
import json
import os
import statistics
import threading
import time
import urllib.error
import urllib.request


latencies = {"create": [], "sign": [], "verify": [], "delete": []}
latency_lock = threading.Lock()


def request(base, method, path, token, body=None):
    payload = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{base.rstrip('/')}{path}",
        data=payload,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
        method=method,
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read().decode()
            result = json.loads(raw) if raw else {}
            return response.status, result, time.perf_counter() - started
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            result = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            result = {"raw": raw}
        return exc.code, result, time.perf_counter() - started


def record(operation, duration):
    with latency_lock:
        latencies[operation].append(duration * 1000)


def flow(base, token, project_id, index):
    name = f"load-{time.time_ns()}-{index}"[-32:]
    status, created, elapsed = request(base, "POST", "/api-go/v1/kms/keys", token, {
        "projectId": project_id, "name": name, "keyUsage": "sign-verify",
        "algorithm": "ECC_NIST_P256", "isExportable": False,
    })
    record("create", elapsed)
    if status != 200:
        raise RuntimeError(f"create HTTP {status}: {created}")
    key_id = created.get("key", {}).get("id")
    if not key_id:
        raise RuntimeError(f"missing key id: {created}")

    data = base64.b64encode(f"load-{index}".encode()).decode()
    status, signed, elapsed = request(base, "POST", f"/api-go/v1/kms/keys/{key_id}/sign", token, {
        "data": data, "signingAlgorithm": "ECDSA_SHA_256", "isDigest": False,
    })
    record("sign", elapsed)
    if status != 200 or not signed.get("signature"):
        raise RuntimeError(f"sign HTTP {status}: {signed}")

    status, verified, elapsed = request(base, "POST", f"/api-go/v1/kms/keys/{key_id}/verify", token, {
        "data": data, "signature": signed["signature"],
        "signingAlgorithm": "ECDSA_SHA_256", "isDigest": False,
    })
    record("verify", elapsed)
    if status != 200 or verified.get("signatureValid") is not True:
        raise RuntimeError(f"verify HTTP {status}: {verified}")

    status, deleted, elapsed = request(base, "DELETE", f"/api-go/v1/kms/keys/{key_id}", token)
    record("delete", elapsed)
    if status != 200:
        raise RuntimeError(f"delete HTTP {status}: {deleted}")


def percentile(values, percentile_value):
    values = sorted(values)
    if not values:
        return 0.0
    rank = (len(values) - 1) * percentile_value / 100
    low, high = int(rank), min(int(rank) + 1, len(values) - 1)
    return values[low] + (values[high] - values[low]) * (rank - low)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("API_GO_BASE_URL", "http://localhost:4040"))
    parser.add_argument("--flows", type=int, default=int(os.getenv("KMS_LOAD_FLOWS", "200")))
    parser.add_argument("--workers", type=int, default=int(os.getenv("KMS_LOAD_WORKERS", "20")))
    args = parser.parse_args()
    token = os.environ["API_GO_TOKEN"]
    project_id = os.environ["API_GO_PROJECT_ID"]

    started = time.perf_counter()
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = [pool.submit(flow, args.base_url, token, project_id, i) for i in range(args.flows)]
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as exc:  # noqa: BLE001
                failures.append(str(exc))

    elapsed = time.perf_counter() - started
    print(f"flows: {args.flows - len(failures)}/{args.flows} passed; requests: {args.flows * 4}; duration: {elapsed:.2f}s; throughput: {args.flows * 4 / elapsed:.1f} req/s")
    for operation, values in latencies.items():
        if values:
            print(f"{operation}: count={len(values)} avg={statistics.mean(values):.2f}ms p90={percentile(values, 90):.2f}ms p95={percentile(values, 95):.2f}ms p99={percentile(values, 99):.2f}ms")
    if failures:
        print("first failures:")
        print("\n".join(failures[:10]))
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
