#!/usr/bin/env python3
"""Run the same steady-state KMS profile against TS then Go in MicroK8s."""
import argparse
import json
import statistics
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
E2E = ROOT / "e2e"
# The requested staging profiles run continuously for two minutes. Totals are
# derived from rate x duration so the generated load is constant-arrival.
PROFILES = {"500": (500, 60_000, 1_000, 4_000), "1k": (1_000, 120_000, 1_000, 4_000)}

def kubectl(*args, input=None, check=True, capture=False):
    return subprocess.run(["microk8s", "kubectl", *args], input=input, text=True, check=check, capture_output=capture)

def request_counts(namespace, selector, since_time, path, output):
    """Count application request log entries per serving pod for this run window."""
    pods = kubectl("get", "pods", "-n", namespace, "-l", selector, "-o", "jsonpath={.items[*].metadata.name}", capture=True).stdout.split()
    counts = {}
    for pod in pods:
        logs = kubectl("logs", "-n", namespace, pod, f"--since-time={since_time}", check=False, capture=True).stdout
        matching = [line for line in logs.splitlines() if path in line]
        # Fastify logs an incoming event and Go logs a completion event. Prefer the
        # former when present so neither implementation is double-counted.
        incoming = sum("incoming request" in line for line in matching)
        completed = sum("request completed" in line for line in matching)
        counts[pod] = incoming or completed
    Path(output).write_text(json.dumps(counts, indent=2) + "\n", encoding="utf-8")

def duration_ms(value):
    units = (("ms", 1), ("µs", 0.001), ("us", 0.001), ("ns", 0.000001), ("s", 1000))
    for unit, multiplier in units:
        if value.endswith(unit):
            return float(value[:-len(unit)]) * multiplier
    raise ValueError(f"unsupported duration: {value}")

def trace_spans(namespace, since_time, output):
    """Correlate opt-in gateway and KMS request IDs; normal requests are ignored."""
    def events(selector, message):
        result = kubectl("get", "pods", "-n", namespace, "-l", selector, "-o", "jsonpath={.items[*].metadata.name}", capture=True)
        for pod in result.stdout.split():
            logs = kubectl("logs", "-n", namespace, pod, f"--since-time={since_time}", check=False, capture=True).stdout
            for line in logs.splitlines():
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if item.get("msg") == message and str(item.get("reqId", "")).startswith("bench-"):
                    yield pod, item

    backend = {}
    for pod, item in events("component=backend-go", "request completed"):
        try:
            backend[item["reqId"]] = {"pod": pod, "duration_ms": duration_ms(item["duration"]), "status": item["statusCode"]}
        except (KeyError, ValueError):
            continue
    kms = {}
    for pod, item in events("component=kms", "benchmark KMS request completed"):
        try:
            kms[item["reqId"]] = {"pod": pod, "duration_ms": duration_ms(item["duration"]), "method": item["method"], "success": item["success"]}
        except (KeyError, ValueError):
            continue

    samples = [{"request_id": req_id, "backend_go": value, "kms": kms.get(req_id)} for req_id, value in backend.items()]
    def stats(values):
        values = sorted(values)
        if not values:
            return None
        return {"count": len(values), "median_ms": statistics.median(values), "p95_ms": values[max(0, int(len(values) * .95) - 1)], "max_ms": max(values)}
    report = {
        "sampled_backend_requests": len(backend),
        "correlated_kms_requests": sum(sample["kms"] is not None for sample in samples),
        "backend_go": stats([sample["backend_go"]["duration_ms"] for sample in samples]),
        "kms": stats([sample["kms"]["duration_ms"] for sample in samples if sample["kms"]]),
        "samples": samples,
    }
    Path(output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

def raft_propagation(namespace, since_time, output):
    """Measure proposal-to-apply latency for identical Raft trace IDs on all KMS pods."""
    pods = kubectl("get", "pods", "-n", namespace, "-l", "component=kms", "-o", "jsonpath={.items[*].metadata.name}", capture=True).stdout.split()
    proposals, applies = {}, {}
    for pod in pods:
        logs = kubectl("logs", "-n", namespace, pod, f"--since-time={since_time}", check=False, capture=True).stdout
        for line in logs.splitlines():
            try:
                item = json.loads(line)
                trace_id = item.get("trace_id")
                timestamp = datetime.fromisoformat(item["time"].replace("Z", "+00:00"))
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue
            if not isinstance(trace_id, str) or not trace_id.startswith("bench-raft-"):
                continue
            if item.get("msg") == "benchmark Raft proposal queued":
                proposals.setdefault(trace_id, timestamp)
            elif item.get("msg") == "benchmark Raft cache apply completed":
                applies.setdefault(trace_id, {})[pod] = {
                    "timestamp": timestamp,
                    "entry_index": item.get("entry_index"),
                }

    per_node_latencies, convergence_latencies, requests = [], [], []
    for trace_id, proposed_at in sorted(proposals.items()):
        applied = applies.get(trace_id, {})
        per_pod = {
            pod: {
                "entry_index": value["entry_index"],
                "apply_timestamp": value["timestamp"].isoformat(),
                "proposal_to_apply_ms": (value["timestamp"] - proposed_at).total_seconds() * 1000,
            }
            for pod, value in applied.items()
        }
        latencies = [value["proposal_to_apply_ms"] for value in per_pod.values()]
        per_node_latencies.extend(latencies)
        complete = len(applied) == len(pods)
        if complete:
            convergence_latencies.append(max(latencies))
        requests.append({
            "request_id": trace_id,
            "proposal_timestamp": proposed_at.isoformat(),
            "replicas_applied": len(applied),
            "expected_replicas": len(pods),
            "fully_converged": complete,
            "per_pod": per_pod,
        })

    def stats(values):
        if not values:
            return None
        values = sorted(values)
        buckets = [round(value, 1) for value in values]
        return {
            "count": len(values),
            "mean_ms": statistics.mean(values),
            "median_ms": statistics.median(values),
            "mode_ms_0_1_bucket": statistics.multimode(buckets),
            "p95_ms": values[max(0, int(len(values) * .95) - 1)],
            "max_ms": max(values),
        }

    report = {
        "measurement": "KMS Raft proposal queued to cache-apply completion",
        "mode_precision_ms": 0.1,
        "kms_replicas": pods,
        "sampled_requests": len(proposals),
        "fully_converged_requests": sum(request["fully_converged"] for request in requests),
        "per_replica_apply": stats(per_node_latencies),
        "three_replica_convergence": stats(convergence_latencies),
        "requests": requests,
    }
    Path(output).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

def run(environment, profile, namespace, inventory, operation="all_other", label=""):
    rate, total, preallocated, maximum = PROFILES[profile]
    target = ("http://traefik.traefik.svc.cluster.local", "api", "component=infisical", "infisical-benchmark.local") if environment == "ts" else ("http://traefik.traefik.svc.cluster.local", "api-go", "component=backend-go", "infisical-go-benchmark.local")
    base, prefix, selector, host_header = target
    suffix = f"-{operation.replace('_', '-')}" + (f"-{label}" if label else "")
    job, configmap = f"k6-kms-{environment}-{profile}{suffix}", f"k6-kms-assets-{environment}-{profile}{suffix}"
    duration = (total + rate - 1) // rate
    artifact_suffix = f"_{operation}" + (f"_{label}" if label else "")
    summary, metrics = E2E / f"k6_summary_{environment}_{profile}{artifact_suffix}.json", E2E / f"k6_kubernetes_metrics_{environment}_{profile}{artifact_suffix}.json"
    requests = E2E / f"k6_pod_requests_{environment}_{profile}{artifact_suffix}.json"
    traces = E2E / f"k6_trace_spans_{environment}_{profile}{artifact_suffix}.json"
    raft_traces = E2E / f"k6_raft_propagation_{environment}_{profile}{artifact_suffix}.json"
    # Do not let an artifact from a prior run make a failed `kubectl cp` look
    # like a current summary. Completed Pods cannot be exec'ed into, so k6's
    # stdout JSON is the reliable fallback in that case.
    summary.unlink(missing_ok=True)
    kubectl("delete", "job", job, "-n", namespace, "--ignore-not-found")
    kubectl("delete", "configmap", configmap, "-n", namespace, "--ignore-not-found")
    kubectl("create", "configmap", configmap, "-n", namespace, f"--from-file=k6_kms_flow.js={E2E / 'k6_kms_flow.js'}", f"--from-file=kms_inventory.json={inventory}")
    manifest = f'''apiVersion: batch/v1
kind: Job
metadata:
  name: {job}
  namespace: {namespace}
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: k6
          image: docker.io/grafana/k6@sha256:5221b620a4f874faff6e32ba597aa667c058391fe4898b1c6f6377f062c6cdec
          imagePullPolicy: IfNotPresent
          args: [run, --summary-export=/results/summary.json, /scripts/k6_kms_flow.js]
          env:
            - name: BASE_URL
              value: {base}
            - name: AUTH_URL
              value: http://infisical-go-infisical:8080
            - name: API_PREFIX
              value: {prefix}
            - name: HOST_HEADER
              value: {host_header}
            - name: RATE
              value: "{rate}"
            - name: OPERATION
              value: "{operation}"
            - name: TOTAL_REQUESTS
              value: "{total}"
            - name: PREALLOCATED_VUS
              value: "{preallocated}"
            - name: MAX_VUS
              value: "{maximum}"
            - name: HOT_KEY_COUNT
              value: "10"
            - name: HOT_RATIO
              value: "0.9"
            - name: TRACE_SAMPLE_RATE
              value: "0.001"
            - name: RAFT_TRACE_SAMPLE_RATE
              value: "0.002"
            - name: ADMIN_EMAIL
              valueFrom:
                secretKeyRef: {{name: infisical-bootstrap-credentials, key: INFISICAL_ADMIN_EMAIL}}
            - name: ADMIN_PASSWORD
              valueFrom:
                secretKeyRef: {{name: infisical-bootstrap-credentials, key: INFISICAL_ADMIN_PASSWORD}}
            - name: ORG_ID
              valueFrom:
                secretKeyRef: {{name: infisical-runtime, key: BENCHMARK_ORG_ID}}
          volumeMounts:
            - name: scripts
              mountPath: /scripts
            - name: results
              mountPath: /results
      volumes:
        - name: scripts
          configMap: {{name: {configmap}}}
        - name: results
          emptyDir: {{}}
'''
    metric_selector = "component in (backend-go,kms)" if environment == "go" else selector
    collector = subprocess.Popen([sys.executable, str(E2E / "collect_kubernetes_metrics.py"), "--namespace", namespace, "--selector", metric_selector, "--duration", str(duration + 15), "--output", str(metrics)])
    start_time = datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    try:
        kubectl("apply", "-f", "-", input=manifest)
        # A deliberately overloaded profile exits non-zero because its k6
        # thresholds fail. Poll both terminal Job states so artifact collection
        # does not wait out a misleading success-only timeout.
        for _ in range(duration + 120):
            status = kubectl("get", "job", job, "-n", namespace, "-o", "json", check=False, capture=True)
            if '"type": "Complete"' in status.stdout or '"type": "Failed"' in status.stdout:
                break
            __import__("time").sleep(1)
        logs = kubectl("logs", "-n", namespace, f"job/{job}", check=False, capture=True)
        (E2E / f"k6_results_{environment}_{profile}{artifact_suffix}.log").write_text(logs.stdout + logs.stderr)
        pod = kubectl("get", "pods", "-n", namespace, "-l", f"job-name={job}", "-o", "jsonpath={.items[0].metadata.name}", capture=True).stdout.strip()
        kubectl("cp", f"{namespace}/{pod}:/results/summary.json", str(summary), check=False)
        if not summary.exists():
            for line in logs.stdout.splitlines():
                if line.startswith("K6_SUMMARY="):
                    data = json.loads(line.removeprefix("K6_SUMMARY="))
                    data.pop("setup_data", None)
                    summary.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
                    break
    finally:
        collector.wait(timeout=duration + 30)
        request_counts(namespace, selector, start_time, f"/{prefix}/v1/kms/keys/", requests)
        if environment == "go":
            trace_spans(namespace, start_time, traces)
            raft_propagation(namespace, start_time, raft_traces)
    print(f"{environment}/{profile}: summary={summary}, memory={metrics}, pod_requests={requests}, traces={traces if environment == 'go' else 'n/a'}, raft={raft_traces if environment == 'go' else 'n/a'}")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", choices=PROFILES, required=True)
    parser.add_argument("--environment", choices=("ts", "go", "both"), default="both")
    parser.add_argument("--operation", choices=("create", "all_other"), default="all_other")
    parser.add_argument("--label", default="", help="suffix artifacts and job names, e.g. cache-disabled")
    parser.add_argument("--namespace", default="infisical-benchmark")
    parser.add_argument("--inventory", type=Path, default=E2E / "k6_kms_inventory.json")
    args = parser.parse_args()
    if not args.inventory.exists(): raise SystemExit(f"missing inventory: seed it first with {E2E / 'seed_k6_kms.py'}")
    for environment in (("ts", "go") if args.environment == "both" else (args.environment,)):
        run(environment, args.profile, args.namespace, args.inventory, args.operation, args.label)

if __name__ == "__main__": main()
