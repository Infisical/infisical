# KMS microservices load-test report

Run date: 2026-09-09. This report supersedes the earlier per-pod resource
tables. Every resource number below is a **deployment total**: at each
one-second sample, CPU and memory from every selected pod are summed first;
mean, median, and peak are then calculated over that total time series.
Peak is therefore the greatest simultaneous all-pod total, not a sum of each
pod's independent peak.

## Tested deployment

The MicroK8s `infisical-benchmark` namespace contained the following steady
state deployment:

| Component | Replicas | Per-pod request / limit | Runtime settings |
| --- | ---: | --- | --- |
| Official TS Infisical backend | 3 | 750m, 5Gi / 1 CPU, 5Gi | official image |
| `backend-go` gateway | 2 | 500m, 200Mi / 500m, 200Mi | `GOMAXPROCS=1`, `GOMEMLIMIT=160MiB` |
| Local KMS Raft service | 3 | 500m, 400Mi / 500m, 400Mi | `GOMAXPROCS=1`, `GOMEMLIMIT=320MiB` |

All services use the same test database and Redis. The Go measurements include
all five Go-path pods (two gateways plus all three KMS pods). The TS
measurements include all three TS pods. Traffic is sent through the in-cluster
load-balancer service; the test was not pinned to an individual backend pod.

## Method and raw data

Each cell uses a constant-arrival k6 scenario for two minutes: 500/s targets
60,000 iterations and 1k/s targets 120,000. `all_other` alternates KMS
sign/verify; `create` creates a fresh KMS key per iteration. A no-load
baseline was sampled immediately before this sequence. `http failures` is the
k6 HTTP failure count; `dropped` is generator-side missed constant-arrival
iterations, not a load-balancer response.

The raw metric artifacts are `e2e/k6_kubernetes_metrics_<env>_<rate>_<operation>.json`
(timestamped pod samples and totals); the k6 output is in the matching
`k6_results_*.log`, including its exact `K6_SUMMARY=` JSON line. Most runs also
have a `k6_summary_*.json` extraction. For completed pods where Kubernetes
prevented `kubectl cp`, the log JSON is authoritative; the obsolete TS 1k
summary extraction was removed rather than leaving a stale result. The runner
now removes a prior summary before a run and has that log fallback, preventing
stale summary reuse.

### Baselines (before any load)

| Deployment total | Pods | Complete samples | Mean CPU | Median CPU | Peak CPU | Mean memory | Median memory | Peak memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| TS backend | 3 | 26 | 25.5m | 25.5m | 28m | 2,317 MiB | 2,317 MiB | 2,317 MiB |
| Go microservices (gateway + KMS) | 5 | 26 | 22.2m | 22.0m | 23m | 75 MiB | 75 MiB | 75 MiB |

## Computed and raw results: all-other (sign/verify)

| Path | Target rate | Raw HTTP reqs | Dropped | HTTP failures | Avg / median latency | p90 / p95 / p99 | Mean / median / peak CPU total | Mean / median / peak memory total | Result |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| TS `/api` | 500/s | 60,003 | 0 | 0 | 18.890 / 3.716 ms | 7.594 / 38.872 / 457.413 ms | 1,195.6 / 1,475 / 1,571m | 2,962.8 / 2,742 / 3,883 MiB | clean |
| Go `/api-go` | 500/s | 60,003 | 0 | 0 | 2.291 / 2.062 ms | 3.534 / 4.185 / 5.800 ms | 370.6 / 240 / 813m | 82.7 / 87 / 92 MiB | clean |
| TS `/api` | 1k/s | 120,003 | 0 | 0 | 37.803 / 3.556 ms | 10.131 / 326.378 / 694.699 ms | 1,586.0 / 2,240 / 2,343m | 3,543.8 / 3,894 / 4,486 MiB | clean |
| Go `/api-go` | 1k/s | 120,003 | 0 | 0 | 1.687 / 1.447 ms | 2.431 / 2.999 / 5.685 ms | 893.1 / 1,101 / 1,118m | 91.0 / 93 / 94 MiB | clean |

At 1k/s the Go path's p99 was 689.014 ms lower than TS (about 99.2% lower)
in this local deployment. This is a benchmark observation, not a universal
production comparison: the TS and Go paths have different implementations and
resource limits.

## Computed and raw results: create-only

| Path | Target rate | Raw HTTP reqs | Dropped | HTTP failures | Avg / median latency | p90 / p95 / p99 | Mean / median / peak CPU total | Mean / median / peak memory total | Result |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| TS `/api` | 500/s | 60,003 | 0 | 0 | 23.066 / 4.430 ms | 9.008 / 96.159 / 519.822 ms | 1,444.3 / 1,740 / 1,782m | 3,218.9 / 3,217 / 3,877 MiB | clean |
| Go `/api-go` | 500/s | 60,003 | 0 | 0 | 2.325 / 2.113 ms | 3.420 / 4.039 / 5.645 ms | 526.0 / 711 / 726m | 88.4 / 92 / 94 MiB | clean |
| TS `/api` | 1k/s | 119,775 | 228 | 0 | 129.445 / 4.454 ms | 539.419 / 807.585 / 1,528.027 ms | 2,032.8 / 2,504 / 2,608m | 3,805.5 / 3,896 / 4,491 MiB | requires retrial: k6 VU exhaustion / 228 dropped iterations |
| Go `/api-go` | 1k/s | 120,003 | 0 | 0 | 1.840 / 1.632 ms | 2.536 / 2.975 / 4.885 ms | 861.1 / 1,026 / 1,042m | 93.5 / 95 / 97 MiB | clean |

The create tests intentionally added successful test keys. The preseed corpus
was 100,000 keys across approximately 100 organizations; this run additionally
issued 359,784 create requests. Re-seed or remove the disposable test database
before treating its contents as a fresh fixture.


## Reproducibility

Use `e2e/run_k6_compare.py` with `--environment ts|go`, `--profile 500|1k`,
and `--operation all_other|create`. The collector retains raw one-second
snapshots under `_snapshots` and puts the aligned deployment calculation under
`_deployment_total` in each metrics artifact.
