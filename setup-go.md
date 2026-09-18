# Backend-Go and KMS deployment guide

This guide deploys the Go API (`backend-go`) with the three-member Raft KMS
microservice. It also describes the local Compose topology and the Kubernetes
benchmark workflow. The Kubernetes benchmark uses an in-cluster Grafana k6 Job;
Docker is not a supported benchmark environment.

## Prerequisites

- Docker, for building the `backend-go` and KMS images.
- Helm 3 and a Kubernetes cluster. The supplied benchmark runner invokes
  `microk8s kubectl`, so the commands below use MicroK8s.
- The MicroK8s `dns`, `metrics-server`, and `registry` add-ons. Metrics Server
  is required for `kubectl top`; the registry makes images available at
  `localhost:32000`.
- Python 3. The Kubernetes runner uses only the standard library. The local
  Raft convergence probe additionally requires `grpcio-tools` and `grpcio`.
- A disposable Infisical deployment and database. The seed scripts create
  organizations, projects, and KMS keys; do not point them at production.

Prepare MicroK8s and chart dependencies:

```sh
microk8s enable dns metrics-server registry
microk8s status --wait-ready
microk8s kubectl create namespace infisical-benchmark
helm dependency build helm-charts/infisical-go
```

Build and publish the two Go images into the local MicroK8s registry. Use a
unique tag for each tested revision and set the same tag in Helm values.

```sh
IMAGE_TAG=trace-raft-1
docker build -t localhost:32000/infisical-backend-go:$IMAGE_TAG backend-go
docker build -t localhost:32000/infisical-kms:$IMAGE_TAG \
  -f backend-go/pkg/services/kms/Dockerfile backend-go
docker push localhost:32000/infisical-backend-go:$IMAGE_TAG
docker push localhost:32000/infisical-kms:$IMAGE_TAG
```

If Docker cannot push to the registry, configure Docker to trust the local
registry or use an image registry reachable by every cluster node and override
`backendGo.image.repository` and `kms.image.repository`.

## Required runtime configuration

All three services must consume the same Kubernetes Secret. The Go API and KMS
need the same database, Redis, encryption, and KMS authentication configuration
as the TypeScript service. At a minimum, the secret must provide:

| Setting | Used by | Notes |
| --- | --- | --- |
| `DB_CONNECTION_URI` | API, KMS, TypeScript API | PostgreSQL URI reachable from pods. |
| `REDIS_URL` | API, KMS, TypeScript API | Redis URI reachable from pods. |
| `ENCRYPTION_KEY` or `ROOT_ENCRYPTION_KEY` | API, KMS, TypeScript API | Keep this stable for data that must remain decryptable. |
| `AUTH_SECRET` | API and TypeScript API | Shared authentication secret. |
| `KMS_AUTH_SECRET` | API and KMS | The API sends it to KMS using `KMS_AUTH_HEADER`. |
| `SITE_URL` | TypeScript API | Set to the externally reachable application URL. |

Start from `docker-compose.dev-microservices.env.example`, but do not commit a
filled-in copy. Replace its development values and point `DB_CONNECTION_URI`
and `REDIS_URL` at the services used by the cluster.

```sh
cp docker-compose.dev-microservices.env.example .runtime.env
# Edit .runtime.env with non-development values and cluster-reachable URLs.
microk8s kubectl -n infisical-benchmark create secret generic infisical-runtime \
  --from-env-file=.runtime.env
```

The benchmark Job logs in as an administrator. Create its credentials separately
from the runtime secret. With Helm auto-bootstrap enabled, these values are also
used by the bootstrap Job.

```sh
microk8s kubectl -n infisical-benchmark create secret generic infisical-bootstrap-credentials \
  --from-literal=INFISICAL_ADMIN_EMAIL='benchmark-admin@example.test' \
  --from-literal=INFISICAL_ADMIN_PASSWORD='replace-with-a-strong-password'
```

Do not reuse production credentials. Avoid placing either secret in a Helm
values file, shell history, or committed test artifact.

## Pre-seeding

The k6 scenario performs sign/verify operations against a persistent inventory
of KMS keys. Create that inventory before starting a k6 Job. The inventory file
is resumable: rerunning the command fills missing project indexes without
recreating completed entries.

First, deploy and bootstrap Infisical, then obtain the benchmark organization
ID from the created benchmark organization. Export it only in the current shell.
The seeders require `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `ORG_ID`.

```sh
export ADMIN_EMAIL='benchmark-admin@example.test'
export ADMIN_PASSWORD='replace-with-a-strong-password'
export ORG_ID='<benchmark-organization-id>'

# In another terminal, expose the TypeScript API to the seed script.
microk8s kubectl -n infisical-benchmark port-forward svc/infisical-go-infisical 18080:8080

# Create 1,000 KMS projects/keys and write the reusable k6 inventory.
python3 e2e/seed_k6_kms.py \
  --base-url http://127.0.0.1:18080 \
  --projects 1000 \
  --output e2e/k6_kms_inventory.json
```

The k6 Job reads `ORG_ID` from `infisical-runtime` under the key
`BENCHMARK_ORG_ID`. Add that key before benchmarking. Recreate or patch the
secret only after confirming its other values are preserved.

```sh
microk8s kubectl -n infisical-benchmark create secret generic benchmark-org-id \
  --from-literal=BENCHMARK_ORG_ID="$ORG_ID" \
  --dry-run=client -o yaml | \
  microk8s kubectl -n infisical-benchmark apply -f -
microk8s kubectl -n infisical-benchmark patch secret infisical-runtime \
  --type merge \
  -p "{\"data\":{\"BENCHMARK_ORG_ID\":\"$(printf %s "$ORG_ID" | base64 | tr -d '\\n')\"}}"
```

For a larger, multi-organization fixture, use `e2e/seed_bulk_kms.py`. Its
state defaults to `e2e/k6_bulk_seed_state.json` and is also resumable.

```sh
SEED_BASE_URL=http://127.0.0.1:18080 \
python3 e2e/seed_bulk_kms.py \
  --organizations 10 \
  --keys-per-organization 10000 \
  --workers 20
```

## Docker Compose with a multi-node KMS cluster

`docker-compose.kms-raft.yml` is a self-contained development topology: one
PostgreSQL instance, one Redis instance, and three KMS containers. Each KMS
member has its own named volume for the Raft WAL and snapshots, and listens on
host ports 4041, 4042, and 4043.

```sh
docker compose -f docker-compose.kms-raft.yml up --build
```

The three members are configured through `RAFT_PEERS`, `RAFT_NODE_ID`,
`RAFT_WAL_DIR`, and `RAFT_SNAPSHOT_DIR`. `DISABLE_CACHE=false` and
`DISABLE_RAFT=false` are required for the Raft cache path. The Compose file
uses development-only credentials; replace `ENCRYPTION_KEY` and
`KMS_AUTH_SECRET` before using it outside a disposable environment.

To run the normal Go API plus a single KMS microservice alongside the standard
development stack, copy the environment example and compose the two files:

```sh
cp docker-compose.dev-microservices.env.example .env
docker compose -f docker-compose.dev.yml -f docker-compose.dev-microservices.yml \
  --profile go up --build
```

The local Raft convergence probe targets the three host ports. It requires
Python gRPC tooling and expects seeded probe keys from the Raft fixture.

```sh
python3 -m pip install grpcio grpcio-tools
python3 e2e/kms_raft_convergence.py --load --requests 10000 --rate 1000
```

This Compose mode is useful for functional development and convergence checks;
it is not a substitute for Kubernetes benchmark results.

## Kubernetes cluster deployment

The `infisical-go` chart deploys:

- the existing TypeScript API (`infisical`);
- a two-member `backend-go` StatefulSet behind weighted Traefik services;
- a three-member KMS StatefulSet with a headless peer service, persistent Raft
  WAL/snapshot volumes, and `DISABLE_RAFT=false`;
- optional PostgreSQL, Redis, and ingress dependencies.

The chart deliberately validates two topology invariants: `backendGo` remains
at two replicas and KMS remains at three replicas. It also requires all API and
KMS workloads to reference the same runtime Secret.

For the benchmark topology, use the checked-in benchmark values. They disable
the chart-managed PostgreSQL and Redis, so the runtime secret must point to
already-provisioned services. The profile enables auto-bootstrap and Traefik
routes for both APIs.

```sh
helm upgrade --install infisical-go helm-charts/infisical-go \
  --namespace infisical-benchmark \
  --values helm-charts/infisical-go/ci/benchmark-values.yaml \
  --set backendGo.image.tag="$IMAGE_TAG" \
  --set kms.image.tag="$IMAGE_TAG" \
  --wait --timeout 15m

microk8s kubectl -n infisical-benchmark get pods,svc,pvc
microk8s kubectl -n infisical-benchmark rollout status statefulset/infisical-go-backend-go
microk8s kubectl -n infisical-benchmark rollout status statefulset/infisical-go-kms
```

Before a run, verify three ready KMS pods, two ready Go API pods, and healthy
PostgreSQL/Redis connectivity. A cache-disabled control run must set both
`backendGo.cache.disabled=true` and `kms.cache.disabled=true`; keeping only one
side disabled produces a different path than the intended control.

## Benchmarking with Kubernetes

The benchmark runner creates an in-cluster `grafana/k6` Job and collects k6
summary data, pod resource metrics, request distribution, Go/KMS trace samples,
and Raft propagation samples under `e2e/`. It relies on `microk8s kubectl` and
Metrics Server. Do not run this benchmark through Docker Compose.

Run the 500 request/s profile for both TypeScript and Go, then run the 1,000
request/s profile. `all_other` is a steady-state sign/verify workload; `create`
measures key creation separately.

```sh
python3 e2e/run_k6_compare.py --profile 500 --environment both --operation all_other
python3 e2e/run_k6_compare.py --profile 500 --environment both --operation create
python3 e2e/run_k6_compare.py --profile 1k --environment both --operation all_other
python3 e2e/run_k6_compare.py --profile 1k --environment both --operation create
```

The profiles are fixed in `e2e/run_k6_compare.py`: 500/s runs for 60 seconds;
1k/s runs for 120 seconds. The runner requires `e2e/k6_kms_inventory.json` and
emits artifacts such as `k6_summary_*`, `k6_kubernetes_metrics_*`,
`k6_pod_requests_*`, `k6_trace_spans_*`, and `k6_raft_propagation_*`.

For a cache-disabled Go control run, update the release first, wait for both
StatefulSets, then label the result so it does not overwrite the normal run:

```sh
helm upgrade infisical-go helm-charts/infisical-go \
  --namespace infisical-benchmark \
  --reuse-values \
  --set backendGo.cache.disabled=true \
  --set kms.cache.disabled=true \
  --wait --timeout 15m

python3 e2e/run_k6_compare.py \
  --profile 500 --environment go --operation all_other --label cache-disabled
```

Inspect a failed Job before rerunning it. The k6 thresholds reject HTTP failure
rates of 1% or greater and any dropped iterations. The runner preserves Job logs
in `e2e/k6_results_<environment>_<profile>_<operation>*.log`; the summary
fallback is emitted in the Job log when `kubectl cp` cannot read a completed
container.

## Local Go API smoke load test

For a short functional smoke test, `e2e/load_test_kms.py` creates a key, signs,
verifies, and deletes it in each flow. This is not the Kubernetes benchmark.

```sh
export API_GO_BASE_URL=http://localhost:4040
export API_GO_TOKEN='<organization-scoped-token>'
export API_GO_PROJECT_ID='<kms-project-id>'
KMS_LOAD_FLOWS=200 KMS_LOAD_WORKERS=20 python3 e2e/load_test_kms.py
```

The script accepts `--base-url`, `--flows`, and `--workers`; equivalent
environment variables are `API_GO_BASE_URL`, `KMS_LOAD_FLOWS`, and
`KMS_LOAD_WORKERS`.
