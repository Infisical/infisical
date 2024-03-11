

# Infisical Helm Chart

| Name | Chart | Application |
| - | - | - |
| [infisical-standalone]() | [![Latest version of 'infisical-standalone' @ Cloudsmith](https://api-prd.cloudsmith.io/v1/badges/version/infisical/helm-charts/helm/infisical-standalone/latest/x/?render=true&show_latest=true)](https://cloudsmith.io/~infisical/repos/helm-charts/packages/detail/helm/infisical-standalone/latest/) | `1.0.0` |

A helm chart for a full Infisical application

## Services

| Service      | Description      |
| ------------ | ---------------- |
| `infisical`  | Infisical's API  |
| `ingress`    | Ingress service  |
| `postgresql` | Database service |
| `redis`      | Cache service    |

## Installation & upgrade

To install or upgrade the `infisical-standalone` chart, run the following:

```sh
# add the Infisical Helm repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update
```

```sh
# create the required configuration secret (auto-generated secrets)
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Namespace
metadata:
  name: infisical-dev
---
apiVersion: v1
kind: Secret
metadata:
  namespace: infisical-dev
  name: infisical-secrets
type: Opaque
stringData:
  ENCRYPTION_KEY: "$(tr -dc '[:alnum:]' </dev/urandom | dd bs=4 count=8 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  AUTH_SECRET: "$(tr -dc '[:alnum:]' </dev/urandom | dd bs=4 count=8 2>/dev/null | tr '[:upper:]' '[:lower:]' | base64)"
EOF
```

```sh
# with default values
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  infisical-standalone infisical/infisical-standalone

# with custom inline values (replace with your own values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  --set ingress.hostName=custom.example.org \
  infisical-standalone infisical/infisical-standalone

# with custom values file (replace with your own values file)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f custom-values.yaml \
  infisical-standalone infisical/infisical-standalone
```

Documentation is also available here : https://infisical.com/docs/self-hosting/deployment-options/kubernetes-helm

> [!IMPORTANT]
> If you change the configuration variables in the `infisical-secrets` resource, you might have to restart the infisical deployment to take effect

### Encryption keys

If you did not explicitly set required environment variables, the local setup ([./examples](./examples)) auto-generated them by default. It's recommended to save these credentials somewhere safe. Run the following command in your cluster where Infisical chart is installed.
 
> [!NOTE]
> Requires [`jq`](https://stedolan.github.io/jq/download/)

```sh
# export secrets to a given file
kubectl get secrets -n infisical-dev infisical-secrets \
  -o json | jq '.data | map_values(@base64d)' > \
  infisical-secrets.$(date +%s).bak
```

### Upgrading

Find the chart upgrade instructions below. When upgrading from your version to one of the listed below, please follow every instructions in between to correctly migrate all your data and avoid loss and unexpected issues.

#### Instructions

1. Make sure **you have all the required environment variables** defined in the value file (`values.yaml` or inline `--set`) you'll provide to `helm`
   1. e.g. All the above mentioned variables
1. **Backup your existing secrets** (before the upgrade, for safety precaution)
   1. e.g. `kubectl get secret infisical-secrets --namespace infisical-dev -o json | jq '{name: .metadata.name,data: .data|map_values(@base64d)}'`
2. **Upgrade the chart**, with the [instructions](#upgrading)
3. You're all set!

---

<details open>
<summary>

### **`0.0.1`** (`v0.44.0`)
MongoDB to PostgreSQL migration
</summary>

Since the new `infisical-standalone-postgres` chart, Infisical moved away from MongoDB to PostgreSQL.

Here's the migration instructions : https://infisical.com/docs/self-hosting/guides/mongo-to-postgres

</details>

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| nameOverride | string | `""` |  |
| fullnameOverride | string | `""` |  |
| infisical.enabled | bool | `true` |  |
| infisical.name | string | `"infisical"` |  |
| infisical.autoDatabaseSchemaMigration | bool | `true` |  |
| infisical.fullnameOverride | string | `""` |  |
| infisical.podAnnotations | object | `{}` |  |
| infisical.deploymentAnnotations | object | `{}` |  |
| infisical.replicaCount | int | `2` |  |
| infisical.image.repository | string | `"infisical/infisical"` |  |
| infisical.image.tag | string | `"v0.46.3-postgres"` |  |
| infisical.image.pullPolicy | string | `"IfNotPresent"` |  |
| infisical.affinity | object | `{}` |  |
| infisical.kubeSecretRef | string | `"infisical-secrets"` |  |
| infisical.service.annotations | object | `{}` |  |
| infisical.service.type | string | `"ClusterIP"` |  |
| infisical.service.nodePort | string | `""` |  |
| infisical.resources.limits.memory | string | `"350Mi"` |  |
| infisical.resources.requests.cpu | string | `"350m"` |  |
| ingress.enabled | bool | `true` |  |
| ingress.hostName | string | `""` |  |
| ingress.ingressClassName | string | `"nginx"` |  |
| ingress.nginx.enabled | bool | `true` |  |
| ingress.annotations | object | `{}` |  |
| ingress.tls | list | `[]` |  |
| postgresql.enabled | bool | `true` |  |
| postgresql.name | string | `"postgresql"` |  |
| postgresql.fullnameOverride | string | `"postgresql"` |  |
| postgresql.auth.username | string | `"infisical"` |  |
| postgresql.auth.password | string | `"root"` |  |
| postgresql.auth.database | string | `"infisicalDB"` |  |
| redis.enabled | bool | `true` |  |
| redis.name | string | `"redis"` |  |
| redis.fullnameOverride | string | `"redis"` |  |
| redis.cluster.enabled | bool | `false` |  |
| redis.usePassword | bool | `true` |  |
| redis.auth.password | string | `"mysecretpassword"` |  |
| redis.architecture | string | `"standalone"` |  |

## Validation

You can automatically validate your custom `values.yaml` schema and get YAML auto-completion in your IDE, refer to this [section](../README.md#validation)

## Persistence

The database persistence is enabled by default, your volumes will remain on your cluster even after uninstalling the chart. To disable persistence, set this value `postgres.persistence.enabled: false`

## Local development

Find the resources and configuration about how to setup your local development environment on a k8s cluster (locally or remotely).

### Requirements

To create a local k8s environment, you'll need at least :

- [`helm`](https://helm.sh/docs/intro/install/) <kbd>required</kbd>
  - to generate the manifests and deploy the chart
- local/remote k8s cluster <kbd>required</kbd>
  - e.g. [`kind`](https://kubernetes.io/docs/tasks/tools/), [`minikube`](https://kubernetes.io/docs/tasks/tools/) or an online provider
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/) <kbd>required</kbd>
  - to interact with the cluster

### Setup

Run one of the below scripts for easy setup :

> [!WARNING]
> The environment might take some minutes to setup the first time as it need to pull all required images and dependencies

```sh
cd infisical/helm-charts/infisical-standalone-postgres/examples

# With 'kind' + 'helm', to create a local cluster and deploy the chart using 'ingress-nginx'
./infisical-kind.sh

# With 'helm' only, if you already have a cluster (local/remote) to deploy the chart
./infisical-helm.sh
```

> [!NOTE]
> Find complete setup scripts in [**./examples**](./examples). Comments make it easy to understand how to setup your local development environment step-by-step

Above examples will deploy the following :

- [**infisical.local**](https://infisical.local)
  - Your local Infisical instance
  - You may have to add `infisical.local` to your `/etc/hosts` or similar depending your OS
    - The corresponding IP will depend on the tool or the way you're exposing the services ([learn more](https://minikube.sigs.k8s.io/docs/handbook/host-access/))
  - Or access it directly on your [localhost](http://localhost:8080) with
    - `kubectl port-forward -n infisical-dev $(kubectl get pods -n infisical-dev -l "app=infisical-standalone" -o jsonpath="{.items[0].metadata.name}") 8080 &`
    - and stop the port-forward with `%` + <kbd>CTRL+C</kbd>

- [**mailhog.infisical.local**](https://mailhog.infisical.local)
  - Local SMTP server used to receive the emails (e.g. signup verification code)
  - You may have to add `mailhog.infisical.local` to your `/etc/hosts` or similar depending your OS
    - The corresponding IP will depend on the tool or the way you're exposing the services ([learn more](https://minikube.sigs.k8s.io/docs/handbook/host-access/))
  - Or access it directly on your [localhost](http://localhost:8025) with:
      - `kubectl port-forward -n infisical-dev $(kubectl get pods -n infisical-dev -l "app.kubernetes.io/name=mailhog,app.kubernetes.io/instance=infisical-mailhog-dev" -o jsonpath="{.items[0].metadata.name}") 8025 &`
      - and stop the port-forward with `%` + <kbd>CTRL+C</kbd>

Default credentials will be used (local use only, since unsecure):
- **infisical**
  - admin user is created at first login (if database is empty)
- **database** (postgres)
  - username: `infisical`
  - password: `root`
  - database: `infisicalDB`
- **cache** (redis)
  - password: `mysecretpassword`