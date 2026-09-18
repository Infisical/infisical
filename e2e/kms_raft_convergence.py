#!/usr/bin/env python3
"""Measure KMS metadata-cache convergence across the local three-node Raft cluster."""

import argparse
import concurrent.futures
import importlib
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import grpc


KEY_IDS = [f"00000000-0000-0000-0000-{key_number:012d}" for key_number in range(1, 101)]
AUTH_METADATA = ()


def load_stubs(repo_root: Path):
    proto_dir = repo_root / "backend-go/pkg/services/kms/proto"
    generated_dir = Path(tempfile.mkdtemp(prefix="kms-raft-proto-"))
    subprocess.run(
        [
            sys.executable, "-m", "grpc_tools.protoc", f"-I{proto_dir}",
            f"--python_out={generated_dir}", f"--grpc_python_out={generated_dir}",
            str(proto_dir / "kms.proto"),
        ],
        check=True,
    )
    sys.path.insert(0, str(generated_dir))
    return importlib.import_module("kms_pb2"), importlib.import_module("kms_pb2_grpc")


def get_key(client, proto, key_id):
    response = client.GetKmsKeyById(
        proto.GetKmsKeyByIdRequest(key_id=key_id), timeout=2, metadata=AUTH_METADATA
    )
    return response.key


def update_request(proto, key_id, sequence):
    field = sequence % 4
    if field == 0:
        return proto.UpdateKmsKeyRequest(key_id=key_id, name=f"raft-name-{sequence}")
    if field == 1:
        return proto.UpdateKmsKeyRequest(key_id=key_id, description=f"raft-description-{sequence}")
    if field == 2:
        return proto.UpdateKmsKeyRequest(key_id=key_id, is_disabled=bool((sequence // 4) % 2))
    return proto.UpdateKmsKeyRequest(key_id=key_id, has_delete_protection=bool((sequence // 4) % 2))


def run_load(clients, proto, requests, rate, timeout):
    for key_id in KEY_IDS:
        for client in clients:
            get_key(client, proto, key_id)

    interval = 1 / rate
    started = time.perf_counter_ns()
    with concurrent.futures.ThreadPoolExecutor(max_workers=128) as pool:
        futures = []
        for sequence in range(requests - 1):
            due = started / 1_000_000_000 + sequence * interval
            remaining = due - time.perf_counter()
            if remaining > 0:
                time.sleep(remaining)
            key_id = KEY_IDS[sequence % len(KEY_IDS)]
            futures.append(pool.submit(
                clients[0].UpdateKmsKey,
                update_request(proto, key_id, sequence),
                timeout=timeout,
                metadata=AUTH_METADATA,
            ))
        for future in futures:
            future.result()

    final_sequence = requests - 1
    final_key_id = KEY_IDS[final_sequence % len(KEY_IDS)]
    due = started / 1_000_000_000 + final_sequence * interval
    remaining = due - time.perf_counter()
    if remaining > 0:
        time.sleep(remaining)
    clients[0].UpdateKmsKey(
        update_request(proto, final_key_id, final_sequence), timeout=timeout, metadata=AUTH_METADATA
    )
    write_done = time.perf_counter_ns()
    expected_delete_protection = bool((final_sequence // 4) % 2)
    print(
        f"{requests} updates completed; measuring final key {final_key_id} "
        f"(has_delete_protection={expected_delete_protection})"
    )

    pending = {1, 2}
    observed_ms = {}
    deadline = time.perf_counter() + timeout
    while pending and time.perf_counter() < deadline:
        for index in tuple(pending):
            if get_key(clients[index], proto, final_key_id).has_delete_protection == expected_delete_protection:
                observed_ms[index + 1] = (time.perf_counter_ns() - write_done) / 1_000_000
                pending.remove(index)
        if pending:
            time.sleep(0.001)
    if pending:
        raise RuntimeError(f"nodes {[index + 1 for index in sorted(pending)]} did not converge within {timeout}s")
    for node, elapsed_ms in observed_ms.items():
        print(f"node {node} final-key cache convergence: {elapsed_ms:.3f} ms")


def main():
    global AUTH_METADATA
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--timeout", type=float, default=10, help="convergence deadline in seconds")
    parser.add_argument("--load", action="store_true", help="run 10,000 updates across 100 keys at 1,000 requests/sec")
    parser.add_argument("--requests", type=int, default=10_000)
    parser.add_argument("--rate", type=int, default=1_000)
    parser.add_argument("--auth-secret-env", default="KMS_AUTH_SECRET")
    args = parser.parse_args()
    auth_secret = os.getenv(args.auth_secret_env)
    if auth_secret:
        AUTH_METADATA = (("x-infisical-kms-auth", auth_secret),)
    proto, proto_grpc = load_stubs(args.repo_root)
    channels = [grpc.insecure_channel(f"127.0.0.1:{port}") for port in (4041, 4042, 4043)]
    clients = [proto_grpc.KMSServiceStub(channel) for channel in channels]

    try:
        if args.load:
            run_load(clients, proto, args.requests, args.rate, args.timeout)
            return 0
        # Prime every node's local cache before changing the source node.
        key_id = KEY_IDS[0]
        original = [get_key(client, proto, key_id).name for client in clients]
        if original != ["raft-cache-probe-1"] * 3:
            raise RuntimeError(f"unexpected initial cache contents: {original}")

        expected = f"raft-cache-{time.time_ns()}"
        started = time.perf_counter_ns()
        clients[0].UpdateKmsKey(
            proto.UpdateKmsKeyRequest(key_id=key_id, name=expected), timeout=2, metadata=AUTH_METADATA
        )
        source_elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
        print(f"node 1 committed update in {source_elapsed_ms:.3f} ms: {expected}")

        pending = {1, 2}
        observed_ms = {}
        deadline = time.perf_counter() + args.timeout
        while pending and time.perf_counter() < deadline:
            for index in tuple(pending):
                if get_key(clients[index], proto, key_id) == expected:
                    observed_ms[index + 1] = (time.perf_counter_ns() - started) / 1_000_000
                    pending.remove(index)
            if pending:
                time.sleep(0.01)

        if pending:
            raise RuntimeError(f"nodes {[index + 1 for index in sorted(pending)]} did not converge within {args.timeout}s")
        for node, elapsed_ms in observed_ms.items():
            print(f"node {node} cache converged in {elapsed_ms:.3f} ms")
        print(f"slowest follower convergence: {max(observed_ms.values()):.3f} ms")
        return 0
    finally:
        for channel in channels:
            channel.close()


if __name__ == "__main__":
    raise SystemExit(main())
