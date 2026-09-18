#!/usr/bin/env python3
"""Collect CPU and memory metrics from Docker containers during a load test."""

import argparse
import csv
import io
import json
import re
import subprocess
import time


def parse_cpu(value):
    return float(value.rstrip("%"))


def parse_memory(value):
    match = re.fullmatch(r"([0-9.]+)(B|KiB|MiB|GiB)", value.strip())
    if not match:
        raise ValueError(f"unsupported Docker memory value: {value!r}")
    number, unit = match.groups()
    factors = {"B": 1 / 1024 / 1024, "KiB": 1 / 1024, "MiB": 1, "GiB": 1024}
    return float(number) * factors[unit]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--output", required=True)
    parser.add_argument("containers", nargs="+", help="Docker container names")
    args = parser.parse_args()
    samples = {name: [] for name in args.containers}
    deadline = time.monotonic() + args.duration
    while time.monotonic() < deadline:
        result = subprocess.run(
            ["docker", "stats", "--no-stream", "--format", "{{.Name}},{{.CPUPerc}},{{.MemUsage}}", *args.containers],
            capture_output=True, text=True, check=True,
        )
        for row in csv.reader(io.StringIO(result.stdout)):
            if len(row) < 3 or row[0] not in samples:
                continue
            memory_used = row[2].split(" /")[0]
            samples[row[0]].append({"cpu": parse_cpu(row[1]), "memory_mib": parse_memory(memory_used)})
        time.sleep(args.interval)

    report = {}
    for name, values in samples.items():
        if not values:
            report[name] = {"samples": 0}
            continue
        report[name] = {
            "samples": len(values),
            "cpu_avg_pct": sum(v["cpu"] for v in values) / len(values),
            "cpu_peak_pct": max(v["cpu"] for v in values),
            "memory_avg_mib": sum(v["memory_mib"] for v in values) / len(values),
            "memory_peak_mib": max(v["memory_mib"] for v in values),
        }
    with open(args.output, "w", encoding="utf-8") as output:
        json.dump(report, output, indent=2)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
