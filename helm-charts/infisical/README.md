

# Infisical Helm Chart

> [!WARNING] 
> This chart is deprecated and discontinued in favor of the new one using PostgreSQL available **[here](../infisical-standalone-postgres/README.md)**.
> Some information here might be outdated! Please migrate to the new version : https://infisical.com/docs/self-hosting/guides/mongo-to-postgres

| Name | Chart | Application |
| - | - | - |
| [infisical](https://infisical.com/docs/self-hosting/deployment-options/kubernetes-helm) | [![Latest version of 'infisical' @ Cloudsmith](https://api-prd.cloudsmith.io/v1/badges/version/infisical/helm-charts/helm/infisical/latest/x/?render=true&show_latest=true)](https://cloudsmith.io/~infisical/repos/helm-charts/packages/detail/helm/infisical/latest/) | `v0.43.19` |

Standalone Infisical instance (mongo, deprecated). An open-source secret management platform.

## Services

| Service   | Description      |
| --------- | ---------------- |
| `backend` | Infisical's API  |
| `mongodb` | Database service |
| `redis`   | Cache service    |
| `mailhog` | SMTP server      |

## Installation & upgrade

To install or upgrade the `infisical` chart, run the following:

```sh
# add the Infisical Helm repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update
```

```sh
# with default values
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  infisical infisical/infisical

# with custom inline values (replace with your own values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  --set ingress.hostName=custom.example.org \
  infisical infisical/infisical

# with custom values file (replace with your own values file)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f custom-values.yaml \
  infisical infisical/infisical
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

### **`0.1.16`**
<details open>
<summary><strong>Click for details</strong></summary>

- Auto-generation for the following variables, to ease your future upgrades or setups :
  - `ENCRYPTION_KEY`
  - `JWT_SIGNUP_SECRET`
  - `JWT_REFRESH_SECRET`
  - `JWT_AUTH_SECRET`
  - `JWT_SERVICE_SECRET`
  - `JWT_MFA_SECRET`

We've migrated the applications' environment variables into `secrets` resources, shared within the deployments through `envFrom`. If you upgrade your installation make sure to backup your deployments' environment variables (e.g. encryption key and jwt secrets).

The preference order is :
- **user-defined** (values file or inline)
  - **existing-secret** (for existing installations, you don't have to specify the secrets when upgrading if they already exist)
    - **auto-generated** (if none of the values above have been found, we'll auto-generate a value for the user, only for the above mentioned variables)
</details>

## Parameters

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| nameOverride | string | `""` | Override release name |
| fullnameOverride | string | `""` | Override release fullname |
| backend.enabled | bool | `true` | Enable backend |
| backend.name | string | `"backend"` | Backend name |
| backend.fullnameOverride | string | `""` | Backend fullnameOverride |
| backend.podAnnotations | object | `{}` | Backend pod annotations |
| backend.deploymentAnnotations | object | `{}` | Backend deployment annotations |
| backend.replicaCount | int | `2` | Backend replica count |
| backend.image.repository | string | `"infisical/infisical"` | Backend image repository |
| backend.image.tag | string | `"latest"` | Backend image tag |
| backend.image.pullPolicy | string | `"IfNotPresent"` | Backend image pullPolicy |
| backend.affinity | object | `{}` | Backend pod affinity |
| backend.kubeSecretRef | string | `""` | Backend secret resource reference name (containing required [backend configuration variables](https://infisical.com/docs/self-hosting/configuration/envars)) |
| backend.service.annotations | object | `{}` | Backend service annotations |
| backend.service.type | string | `"ClusterIP"` | Backend service type |
| backend.service.nodePort | string | `""` | Backend service nodePort (used if above type is `NodePort`) |
| backendEnvironmentVariables.ENCRYPTION_KEY | string | `""` | **Required** Backend encryption key (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_SIGNUP_SECRET | string | `""` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_REFRESH_SECRET | string | `""` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_AUTH_SECRET | string | `""` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_SERVICE_SECRET | string | `""` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_MFA_SECRET | string | `""` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.JWT_PROVIDER_AUTH_SECRET | string | `""` | **Required** Secrets to sign JWT OAuth tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) |
| backendEnvironmentVariables.SMTP_HOST | string | `""` | **Required** Hostname to connect to for establishing SMTP connections |
| backendEnvironmentVariables.SMTP_PORT | int | `587` | Port to connect to for establishing SMTP connections |
| backendEnvironmentVariables.SMTP_SECURE | bool | `false` | If true, use TLS when connecting to host. If false, TLS will be used if STARTTLS is supported |
| backendEnvironmentVariables.SMTP_FROM_NAME | string | `"Infisical"` | Name label to be used in From field (e.g. Infisical) |
| backendEnvironmentVariables.SMTP_FROM_ADDRESS | string | `""` | **Required** Email address to be used for sending emails (e.g. dev@infisical.com) |
| backendEnvironmentVariables.SMTP_USERNAME | string | `""` | **Required** Credential to connect to host (e.g. team@infisical.com) |
| backendEnvironmentVariables.SMTP_PASSWORD | string | `""` | **Required** Credential to connect to host |
| backendEnvironmentVariables.SITE_URL | string | `"infisical.local"` | Absolute URL including the protocol (e.g. https://app.infisical.com) |
| backendEnvironmentVariables.INVITE_ONLY_SIGNUP | bool | `false` | To disable account creation from the login page (invites only) |
| backendEnvironmentVariables.MONGO_URL | string | `""` | MongoDB connection string (external or internal)</br>Leave it empty for auto-generated connection string |
| backendEnvironmentVariables.REDIS_URL | string | `"redis://redis-master:6379"` | Redis URL (cache service) |
| mongodb.enabled | bool | `true` | Enable MongoDB(&reg;) |
| mongodb.name | string | `"mongodb"` | Name used to build variables (deprecated) |
| mongodb.fullnameOverride | string | `"mongodb"` | Fullname override |
| mongodb.nameOverride | string | `"mongodb"` | Name override |
| mongodb.podAnnotations | object | `{}` | Pod annotations |
| mongodb.useStatefulSet | bool | `true` | Set to true to use a StatefulSet instead of a Deployment (only when `architecture: standalone`) |
| mongodb.architecture | string | `"standalone"` | MongoDB(&reg;) architecture (`standalone` or `replicaset`) |
| mongodb.image.repository | string | `"bitnami/mongodb"` | MongoDB(&reg;) image registry |
| mongodb.image.pullPolicy | string | `"IfNotPresent"` | MongoDB(&reg;) image pull policy |
| mongodb.image.tag | string | `"6.0.4-debian-11-r0"` | MongoDB(&reg;) image tag (immutable tags are recommended) |
| mongodb.livenessProbe.enabled | bool | `true` | Enable livenessProbe |
| mongodb.livenessProbe.initialDelaySeconds | int | `30` | Initial delay seconds for livenessProbe |
| mongodb.livenessProbe.periodSeconds | int | `20` | Period seconds for livenessProbe |
| mongodb.livenessProbe.timeoutSeconds | int | `10` | Timeout seconds for livenessProbe |
| mongodb.livenessProbe.failureThreshold | int | `6` | Failure threshold for livenessProbe |
| mongodb.livenessProbe.successThreshold | int | `1` | Success threshold for livenessProbe |
| mongodb.readinessProbe.enabled | bool | `true` | Enable readinessProbe |
| mongodb.readinessProbe.initialDelaySeconds | int | `5` | Initial delay seconds for readinessProbe |
| mongodb.readinessProbe.periodSeconds | int | `10` | Period seconds for readinessProbe |
| mongodb.readinessProbe.timeoutSeconds | int | `10` | Timeout seconds for readinessProbe |
| mongodb.readinessProbe.failureThreshold | int | `6` | Failure threshold for readinessProbe |
| mongodb.readinessProbe.successThreshold | int | `1` | Success threshold for readinessProbe |
| mongodb.service.annotations | object | `{}` | Service annotations |
| mongodb.auth.enabled | bool | `true` | Enable custom authentication |
| mongodb.auth.usernames | list | `["infisical"]` | Custom usernames list ([special characters warning](https://www/docs/manual/reference/connection-string/#standard-connection-string-format)) |
| mongodb.auth.passwords | list | `["infisical"]` | Custom passwords list, match the above usernames order ([special characters warning](https://www/docs/manual/reference/connection-string/#standard-connection-string-format)) |
| mongodb.auth.databases | list | `["infisical"]` | Custom databases list ([special characters warning](https://www/docs/manual/reference/connection-string/#standard-connection-string-format)) |
| mongodb.auth.rootUser | string | `"root"` | Database root user name |
| mongodb.auth.rootPassword | string | `"root"` | Database root user password |
| mongodb.auth.existingSecret | string | `""` | Existing secret with MongoDB(&reg;) credentials (keys: `mongodb-passwords`, `mongodb-root-password`, `mongodb-metrics-password`, `mongodb-replica-set-key`) |
| mongodb.persistence.enabled | bool | `true` | Enable database persistence |
| mongodb.persistence.existingClaim | string | `""` | Existing persistent volume claim name |
| mongodb.persistence.resourcePolicy | string | `"keep"` | Keep the persistent volume even on deletion (`keep` or `""`) |
| mongodb.persistence.accessModes | list | `["ReadWriteOnce"]` | Persistent volume access modes |
| mongodb.persistence.size | string | `"8Gi"` | Persistent storage request size |
| mongodbConnection.externalMongoDBConnectionString | string | `""` | Deprecated :warning: External MongoDB connection string</br>Use `backendEnvironmentVariables.MONGO_URL` instead |
| ingress.enabled | bool | `true` | Enable ingress |
| ingress.ingressClassName | string | `"nginx"` | Ingress class name |
| ingress.nginx.enabled | bool | `false` | Enable and install `ingress-nginx` controller |
| ingress.annotations | object | `{}` | Ingress annotations |
| ingress.hostName | string | `""` | Ingress hostname (your custom domain name, e.g. `infisical.example.org`). Replace with your own domain |
| ingress.tls | list | `[]` | Ingress TLS hosts (matching above hostName). Replace with your own domain |
| mailhog.enabled | bool | `false` | Enable Mailhog |
| mailhog.fullnameOverride | string | `"mailhog"` | Fullname override |
| mailhog.nameOverride | string | `""` | Name override |
| mailhog.image.repository | string | `"lytrax/mailhog"` | Image repository |
| mailhog.image.tag | string | `"latest"` | Image tag |
| mailhog.image.pullPolicy | string | `"IfNotPresent"` | Image pull policy |
| mailhog.containerPort.http | object | `{"name":"http","port":8025}` | Mailhog HTTP port (Web UI) |
| mailhog.containerPort.smtp | object | `{"name":"tcp-smtp","port":1025}` | Mailhog SMTP port (Mail) |
| mailhog.service.annotations | object | `{}` |  |
| mailhog.service.extraPorts | list | `[]` |  |
| mailhog.service.clusterIP | string | `""` |  |
| mailhog.service.externalIPs | list | `[]` |  |
| mailhog.service.loadBalancerIP | string | `""` |  |
| mailhog.service.loadBalancerSourceRanges | list | `[]` |  |
| mailhog.service.type | string | `"ClusterIP"` |  |
| mailhog.service.namedTargetPort | bool | `true` |  |
| mailhog.service.port.http | int | `8025` |  |
| mailhog.service.port.smtp | int | `1025` |  |
| mailhog.service.nodePort.http | string | `""` |  |
| mailhog.service.nodePort.smtp | string | `""` |  |
| mailhog.ingress.enabled | bool | `true` | Enable ingress |
| mailhog.ingress.ingressClassName | string | `"nginx"` | Ingress class name |
| mailhog.ingress.annotations | object | `{}` | Ingress annotations |
| mailhog.ingress.labels | object | `{}` | Ingress labels |
| mailhog.ingress.hosts[0] | object | `{"host":"mailhog.infisical.local","paths":[{"path":"/","pathType":"Prefix"}]}` | Mailhog host |
| mailhog.ingress.hosts[0].paths | list | `[{"path":"/","pathType":"Prefix"}]` | Mailhog paths |
| redis.enabled | bool | `true` | Enable Redis |
| redis.name | string | `"redis"` | Redis deployment name |
| redis.fullnameOverride | string | `"redis"` | Redis fullname override |
| redis.architecture | string | `"standalone"` | Redis architecture |
| redis.auth.enabled | bool | `false` | Redis authentication |

## Validation

You can automatically validate your custom `values.yaml` schema and get YAML auto-completion in your IDE, refer to this [section](../README.md#validation)

## Persistence

The database persistence is enabled by default, your volumes will remain on your cluster even after uninstalling the chart. To disable persistence, set this value `mongodb.persistence.enabled: false`

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
cd infisical/helm-charts/infisical/examples

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

- [**mailhog.infisical.local**](https://mailhog.infisical.local)
  - Local SMTP server used to receive the emails (e.g. signup verification code)
  - You may have to add `mailhog.infisical.local` to your `/etc/hosts` or similar depending your OS
    - The corresponding IP will depend on the tool or the way you're exposing the services ([learn more](https://minikube.sigs.k8s.io/docs/handbook/host-access/))