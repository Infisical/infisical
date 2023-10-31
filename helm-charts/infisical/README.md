# Infisical Helm Chart

This is the Infisical application Helm chart. This chart includes the following :

| Service    | Description                         |
| ---------- | ----------------------------------- |
| `backend`  | Infisical's API                     |
| `mongodb`  | Infisical's database                |
| `redis`    | Infisical's cache service           |
| `mailhog`  | Infisical's development SMTP server |

## Installation

To install the chart, run the following :

```sh
# Add the Infisical repository
helm repo add infisical 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/' && helm repo update

# Install Infisical (with default values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  infisical infisical/infisical

# Install Infisical (with custom inline values, replace with your own values)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  --set mongodb.enabled=false \
  --set mongodbConnection.externalMongoDBConnectionString="mongodb://<user>:<pass>@<host>:<port>/<database-name>" \
  infisical infisical/infisical

# Install Infisical (with custom values file, replace with your own values file)
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f custom-values.yaml \
  infisical infisical/infisical
```

### Backup up encryption keys

If you did not explicitly set required environment variables, this helm chart will auto-generated them by default. It's recommended to save these credentials somewhere safe. Run the following command in your cluster where Infisical chart is installed. 
  
This command requires [`jq`](https://stedolan.github.io/jq/download/)

```sh
# export secrets to a given file (requires jq)
kubectl get secrets -n <namespace> <secret-name> \
  -o json | jq '.data | map_values(@base64d)' > \
  <dest-filename>.bak
```

## Parameters

### Common parameters

| Name               | Description               | Value |
| ------------------ | ------------------------- | ----- |
| `nameOverride`     | Override release name     | `""`  |
| `fullnameOverride` | Override release fullname | `""`  |

### Infisical backend parameters

| Name                                                   | Description                                                                                                                                                                                                                         | Value                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `backend.enabled`                                      | Enable backend                                                                                                                                                                                                                      | `true`                      |
| `backend.name`                                         | Backend name                                                                                                                                                                                                                        | `backend`                   |
| `backend.fullnameOverride`                             | Backend fullnameOverride                                                                                                                                                                                                            | `""`                        |
| `backend.podAnnotations`                               | Backend pod annotations                                                                                                                                                                                                             | `{}`                        |
| `backend.deploymentAnnotations`                        | Backend deployment annotations                                                                                                                                                                                                      | `{}`                        |
| `backend.replicaCount`                                 | Backend replica count                                                                                                                                                                                                               | `2`                         |
| `backend.image.repository`                             | Backend image repository                                                                                                                                                                                                            | `infisical/infisical`       |
| `backend.image.tag`                                    | Backend image tag                                                                                                                                                                                                                   | `latest`                    |
| `backend.image.pullPolicy`                             | Backend image pullPolicy                                                                                                                                                                                                            | `IfNotPresent`              |
| `backend.affinity`                                     | Backend pod affinity                                                                                                                                                                                                                | `{}`                        |
| `backend.kubeSecretRef`                                | Backend secret resource reference name (containing required [backend configuration variables](https://infisical.com/docs/self-hosting/configuration/envars))                                                                        | `""`                        |
| `backend.service.annotations`                          | Backend service annotations                                                                                                                                                                                                         | `{}`                        |
| `backend.service.type`                                 | Backend service type                                                                                                                                                                                                                | `ClusterIP`                 |
| `backend.service.nodePort`                             | Backend service nodePort (used if above type is `NodePort`)                                                                                                                                                                         | `""`                        |
| `backendEnvironmentVariables.ENCRYPTION_KEY`           | **Required** Backend encryption key (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)           | `""`                        |
| `backendEnvironmentVariables.JWT_SIGNUP_SECRET`        | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)       | `""`                        |
| `backendEnvironmentVariables.JWT_REFRESH_SECRET`       | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)       | `""`                        |
| `backendEnvironmentVariables.JWT_AUTH_SECRET`          | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)       | `""`                        |
| `backendEnvironmentVariables.JWT_SERVICE_SECRET`       | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)       | `""`                        |
| `backendEnvironmentVariables.JWT_MFA_SECRET`           | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret)       | `""`                        |
| `backendEnvironmentVariables.JWT_PROVIDER_AUTH_SECRET` | **Required** Secrets to sign JWT OAuth tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))</br><kbd>auto-generated</kbd> variable (if not provided, and not found in an existing secret) | `""`                        |
| `backendEnvironmentVariables.SMTP_HOST`                | **Required** Hostname to connect to for establishing SMTP connections                                                                                                                                                               | `""`                        |
| `backendEnvironmentVariables.SMTP_PORT`                | Port to connect to for establishing SMTP connections                                                                                                                                                                                | `587`                       |
| `backendEnvironmentVariables.SMTP_SECURE`              | If true, use TLS when connecting to host. If false, TLS will be used if STARTTLS is supported                                                                                                                                       | `false`                     |
| `backendEnvironmentVariables.SMTP_FROM_NAME`           | Name label to be used in From field (e.g. Infisical)                                                                                                                                                                                | `Infisical`                 |
| `backendEnvironmentVariables.SMTP_FROM_ADDRESS`        | **Required** Email address to be used for sending emails (e.g. dev@infisical.com)                                                                                                                                                   | `""`                        |
| `backendEnvironmentVariables.SMTP_USERNAME`            | **Required** Credential to connect to host (e.g. team@infisical.com)                                                                                                                                                                | `""`                        |
| `backendEnvironmentVariables.SMTP_PASSWORD`            | **Required** Credential to connect to host                                                                                                                                                                                          | `""`                        |
| `backendEnvironmentVariables.SITE_URL`                 | Absolute URL including the protocol (e.g. https://app.infisical.com)                                                                                                                                                                | `infisical.local`           |
| `backendEnvironmentVariables.INVITE_ONLY_SIGNUP`       | To disable account creation from the login page (invites only)                                                                                                                                                                      | `false`                     |
| `backendEnvironmentVariables.MONGO_URL`                | MongoDB connection string (external or internal)</br>Leave it empty for auto-generated connection string                                                                                                                            | `""`                        |
| `backendEnvironmentVariables.REDIS_URL`                |                                                                                                                                                                                                                                     | `redis://redis-master:6379` |

### MongoDB(&reg;) parameters

| Name                                                | Description                                                                                                                                                                               | Value                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `mongodb.enabled`                                   | Enable MongoDB(&reg;)                                                                                                                                                                     | `true`               |
| `mongodb.name`                                      | Name used to build variables (deprecated)                                                                                                                                                 | `mongodb`            |
| `mongodb.fullnameOverride`                          | Fullname override                                                                                                                                                                         | `mongodb`            |
| `mongodb.nameOverride`                              | Name override                                                                                                                                                                             | `mongodb`            |
| `mongodb.podAnnotations`                            | Pod annotations                                                                                                                                                                           | `{}`                 |
| `mongodb.useStatefulSet`                            | Set to true to use a StatefulSet instead of a Deployment (only when `architecture: standalone`)                                                                                           | `true`               |
| `mongodb.architecture`                              | MongoDB(&reg;) architecture (`standalone` or `replicaset`)                                                                                                                                | `standalone`         |
| `mongodb.image.repository`                          | MongoDB(&reg;) image registry                                                                                                                                                             | `bitnami/mongodb`    |
| `mongodb.image.tag`                                 | MongoDB(&reg;) image tag (immutable tags are recommended)                                                                                                                                 | `6.0.4-debian-11-r0` |
| `mongodb.image.pullPolicy`                          | MongoDB(&reg;) image pull policy                                                                                                                                                          | `IfNotPresent`       |
| `mongodb.livenessProbe.enabled`                     | Enable livenessProbe                                                                                                                                                                      | `true`               |
| `mongodb.livenessProbe.initialDelaySeconds`         | Initial delay seconds for livenessProbe                                                                                                                                                   | `30`                 |
| `mongodb.livenessProbe.periodSeconds`               | Period seconds for livenessProbe                                                                                                                                                          | `20`                 |
| `mongodb.livenessProbe.timeoutSeconds`              | Timeout seconds for livenessProbe                                                                                                                                                         | `10`                 |
| `mongodb.livenessProbe.failureThreshold`            | Failure threshold for livenessProbe                                                                                                                                                       | `6`                  |
| `mongodb.livenessProbe.successThreshold`            | Success threshold for livenessProbe                                                                                                                                                       | `1`                  |
| `mongodb.readinessProbe.enabled`                    | Enable readinessProbe                                                                                                                                                                     | `true`               |
| `mongodb.readinessProbe.initialDelaySeconds`        | Initial delay seconds for readinessProbe                                                                                                                                                  | `5`                  |
| `mongodb.readinessProbe.periodSeconds`              | Period seconds for readinessProbe                                                                                                                                                         | `10`                 |
| `mongodb.readinessProbe.timeoutSeconds`             | Timeout seconds for readinessProbe                                                                                                                                                        | `10`                 |
| `mongodb.readinessProbe.failureThreshold`           | Failure threshold for readinessProbe                                                                                                                                                      | `6`                  |
| `mongodb.readinessProbe.successThreshold`           | Success threshold for readinessProbe                                                                                                                                                      | `1`                  |
| `mongodb.service.annotations`                       | Service annotations                                                                                                                                                                       | `{}`                 |
| `mongodb.auth.enabled`                              | Enable custom authentication                                                                                                                                                              | `true`               |
| `mongodb.auth.usernames`                            | Custom usernames list ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format))                                  | `["infisical"]`      |
| `mongodb.auth.passwords`                            | Custom passwords list, match the above usernames order ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format)) | `["infisical"]`      |
| `mongodb.auth.databases`                            | Custom databases list ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format))                                  | `["infisical"]`      |
| `mongodb.auth.rootUser`                             | Database root user name                                                                                                                                                                   | `root`               |
| `mongodb.auth.rootPassword`                         | Database root user password                                                                                                                                                               | `root`               |
| `mongodb.auth.existingSecret`                       | Existing secret with MongoDB(&reg;) credentials (keys: `mongodb-passwords`, `mongodb-root-password`, `mongodb-metrics-password`, `mongodb-replica-set-key`)                               | `""`                 |
| `mongodb.persistence.enabled`                       | Enable database persistence                                                                                                                                                               | `true`               |
| `mongodb.persistence.existingClaim`                 | Existing persistent volume claim name                                                                                                                                                     | `""`                 |
| `mongodb.persistence.resourcePolicy`                | Keep the persistent volume even on deletion (`keep` or `""`)                                                                                                                              | `keep`               |
| `mongodb.persistence.accessModes`                   | Persistent volume access modes                                                                                                                                                            | `["ReadWriteOnce"]`  |
| `mongodb.persistence.size`                          | Persistent storage request size                                                                                                                                                           | `8Gi`                |
| `mongodbConnection.externalMongoDBConnectionString` | Deprecated :warning: External MongoDB connection string</br>Use backendEnvironmentVariables.MONGO_URL instead                                                                             | `""`                 |

### Ingress parameters

| Name                       | Description                                                              | Value   |
| -------------------------- | ------------------------------------------------------------------------ | ------- |
| `ingress.enabled`          | Enable ingress                                                           | `true`  |
| `ingress.ingressClassName` | Ingress class name                                                       | `nginx` |
| `ingress.nginx.enabled`    | Ingress controller                                                       | `false` |
| `ingress.annotations`      | Ingress annotations                                                      | `{}`    |
| `ingress.hostName`         | Ingress hostname (your custom domain name, e.g. `infisical.example.org`) | `""`    |
| `ingress.tls`              | Ingress TLS hosts (matching above hostName)                              | `[]`    |

### Mailhog parameters

| Name                               | Description                | Value                     |
| ---------------------------------- | -------------------------- | ------------------------- |
| `mailhog.enabled`                  | Enable Mailhog             | `false`                   |
| `mailhog.fullnameOverride`         | Fullname override          | `mailhog`                 |
| `mailhog.nameOverride`             | Name override              | `""`                      |
| `mailhog.image.repository`         | Image repository           | `lytrax/mailhog`          |
| `mailhog.image.tag`                | Image tag                  | `latest`                  |
| `mailhog.image.pullPolicy`         | Image pull policy          | `IfNotPresent`            |
| `mailhog.containerPort.http.port`  | Mailhog HTTP port (Web UI) | `8025`                    |
| `mailhog.containerPort.smtp.port`  | Mailhog SMTP port (Mail)   | `1025`                    |
| `mailhog.ingress.enabled`          | Enable ingress             | `true`                    |
| `mailhog.ingress.ingressClassName` | Ingress class name         | `nginx`                   |
| `mailhog.ingress.annotations`      | Ingress annotations        | `{}`                      |
| `mailhog.ingress.labels`           | Ingress labels             | `{}`                      |
| `mailhog.ingress.hosts[0].host`    | Mailhog host               | `mailhog.infisical.local` |

### Redis parameters







## Persistence

The database persistence is enabled by default, your volumes will remain on your cluster even after uninstalling the chart. To disable persistence, set this value `mongodb.persistence.enabled: false`

## Local development

Find the resources and configuration about how to setup your local develoment environment on a k8s environment.

### Requirements

To create a local k8s environment, you'll need :

- [`helm`](https://helm.sh/docs/intro/install/) <kbd>required</kbd>
  - to generate the manifests and deploy the chart 
- local/remote k8s cluster <kbd>required</kbd>
  - e.g. [`kind`](https://kubernetes.io/docs/tasks/tools/), [`minikube`](https://kubernetes.io/docs/tasks/tools/) or an online provider
- [`kubectl`](https://kubernetes.io/docs/tasks/tools/) <kbd>optional</kbd>
  - to interact with the cluster

### Examples

ℹ️ Find complete setup scripts in [**./examples**](./examples)

Below example will deploy the following :

- [**infisical.local**](https://infisical.local)
  - Your local Infisical instance
  - You may have to add `infisical.local` to your `/etc/hosts` or similar depending your OS
    - The corresponding IP will depend on the tool or the way you're exposing the services ([learn more](https://minikube.sigs.k8s.io/docs/handbook/host-access/))

- [**mailhog.infisical.local**](https://mailhog.infisical.local)
  - Local SMTP server used to receive the emails (e.g. signup verification code)
  - You may have to add `mailhog.infisical.local` to your `/etc/hosts` or similar depending your OS
    - The corresponding IP will depend on the tool or the way you're exposing the services ([learn more](https://minikube.sigs.k8s.io/docs/handbook/host-access/))

Use below values to setup a local development environment, adapt those variables as you need

#### TL;DR

If you're running a k8s cluster with `ingress-nginx`, you can run one of the below scripts :

```sh
# With 'kind' + 'helm', to create a local cluster and deploy the chart
./examples.local-kind.sh

# With 'helm' only, if you already have a cluster to deploy the chart
./examples.local-helm.sh
```

#### Instructions

Here's the step-by-step instructions to setup your local development environment. First create the below file :

```yaml
# values.dev.yaml

# Enable mailhog for local development
mailhog:
    enabled: true

# Configure backend development variables (required)
backendEnvironmentVariables:
  SITE_URL: https://infisical.local
  SMTP_FROM_ADDRESS: dev@infisical.local
  SMTP_FROM_NAME: Local Infisical
  SMTP_HOST: mailhog
  SMTP_PASSWORD: ""
  SMTP_PORT: 1025
  SMTP_SECURE: false
  SMTP_USERNAME: dev@infisical.local

# Configure frontend development variables (required)
frontendEnvironmentVariables:
  SITE_URL: https://infisical.local
```

After creating the above file, run :

```sh
# Fetch the required charts
helm dep update

# Install/upgrade Infisical
helm upgrade --install --atomic \
  -n infisical-dev --create-namespace \
  -f ./values.dev.yaml \
  infisical-dev .
```

## Upgrading

Find the chart upgrade instructions below. When upgrading from your version to one of the listed below, please follow every instructions in between.

Here's a snippet to upgrade your installation manually :

```sh
# replace below '<placeholders>' with your own values
helm upgrade --install --atomic \
  -n "<your-namesapce>" --create-namespace \
  -f "<your-values.yaml>" \
  <your-release-name> .
```

ℹ️ Since we provide references to the k8s secret resources within the pods, their manifest file doesnt change and though doesnt reload (no changes detected). When upgrading your secrets, you'll have to do it through Helm (a timestamp field will be updated and your pods restarted)

### 0.1.16

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

#### Instructions

1. Make sure **you have all the required environment variables** defined in the value file (or inline `--set`) you'll provide to `helm`
   1. e.g. All the above mentioned variables
1. **Backup your existing secrets** (safety precaution)
   1. with below [snippets](#snippets)
1. **Upgrade the chart**, with the [instructions](#upgrading)
   1. It'll create a secret per service, and store the secrets/conf within (auto-generate if you don't provide the required ones)
   1. It'll link the secret to the deployment through `envFrom`
   1. It'll automatically remove the hard-coded `env.*` variables from your infisical deployments
1. Make sure that the **created secrets match the ones in your backups**
   1. e.g. `kubectl get secret -n <namespace> <release-name>-backend --template={{.data.ENCRYPTION_KEY}} | base64 -d`
1. You're all set!

#### Snippets

Here's some snippets to backup your current secrets **before the upgrade** (:warning: it requires [`jq`](https://stedolan.github.io/jq/download/)) :

```sh
# replace the below variables with yours (namespace + app)
namespace=infisical; app=infisical; components="frontend backend"

for component in $components; do
  dpl=$(kubectl get deployment -n $namespace -l app=$app -l component=$component \
    -o jsonpath="{.items[0].metadata.name}")

  kubectl get deployments -n $namespace $dpl \
    -o jsonpath='{.spec.template.spec.containers[0].env[*]}' | \
    jq -r '.name + ":" + .value' > infisical-$component-conf.bak
done
```
