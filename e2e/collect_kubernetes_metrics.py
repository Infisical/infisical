#!/usr/bin/env python3
"""Collect Kubernetes CPU and memory samples for one benchmark component."""
import argparse
import json
import statistics
import subprocess
import time
from collections import defaultdict

def mib(value):
    for unit, factor in (("Ki", 1 / 1024), ("Mi", 1), ("Gi", 1024)):
        if value.endswith(unit): return float(value[:-len(unit)]) * factor
    return float(value) / 1024 / 1024

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--namespace", required=True)
    parser.add_argument("--selector", required=True)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--interval", type=float, default=1)
    args = parser.parse_args()
    samples = defaultdict(list)
    snapshots = []
    deadline = time.monotonic() + args.duration
    while time.monotonic() < deadline:
        result = subprocess.run(["microk8s", "kubectl", "top", "pods", "-n", args.namespace, "-l", args.selector, "--no-headers"], capture_output=True, text=True)
        if result.returncode == 0:
            snapshot = {}
            for row in result.stdout.splitlines():
                values = row.split()
                if len(values) >= 3:
                    cpu_m, memory_mib = float(values[1].rstrip("m")), mib(values[2])
                    samples[values[0]].append((cpu_m, memory_mib))
                    snapshot[values[0]] = {"cpu_m": cpu_m, "memory_mib": memory_mib}
            if snapshot: snapshots.append({"timestamp_unix": time.time(), "pods": snapshot})
        time.sleep(args.interval)
    report = {pod: {"samples": len(values), "cpu_avg_m": sum(v[0] for v in values) / len(values), "cpu_peak_m": max(v[0] for v in values), "memory_avg_mib": sum(v[1] for v in values) / len(values), "memory_peak_mib": max(v[1] for v in values)} for pod, values in samples.items() if values}
    expected_pods = max((len(item["pods"]) for item in snapshots), default=0)
    complete = [item for item in snapshots if len(item["pods"]) == expected_pods]
    if complete:
        cpu_totals = [sum(value["cpu_m"] for value in item["pods"].values()) for item in complete]
        memory_totals = [sum(value["memory_mib"] for value in item["pods"].values()) for item in complete]
        report["_deployment_total"] = {
            "pod_count": expected_pods,
            "complete_samples": len(complete),
            "cpu_mean_m": statistics.mean(cpu_totals),
            "cpu_median_m": statistics.median(cpu_totals),
            "cpu_peak_m": max(cpu_totals),
            "memory_mean_mib": statistics.mean(memory_totals),
            "memory_median_mib": statistics.median(memory_totals),
            "memory_peak_mib": max(memory_totals),
            "peak_semantics": "sum across all pods in one timestamped sample",
        }
    report["_snapshots"] = snapshots
    with open(args.output, "w", encoding="utf-8") as output: json.dump(report, output, indent=2)

if __name__ == "__main__": main()
