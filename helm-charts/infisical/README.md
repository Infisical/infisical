# Infisical - Helm Chart

This is the Infisical application Helm chart.

## Parameters

### Common parameters

| Name               | Description               | Value |
| ------------------ | ------------------------- | ----- |
| `nameOverride`     | Override release name     | `""`  |
| `fullnameOverride` | Override release fullname | `""`  |


### Infisical frontend parameters

| Name                                    | Description                                                                                                                                                   | Value                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `frontend.enabled`                      | Enable frontend                                                                                                                                               | `true`               |
| `frontend.name`                         | Backend name                                                                                                                                                  | `frontend`           |
| `frontend.fullnameOverride`             | Backend fullnameOverride                                                                                                                                      | `""`                 |
| `frontend.podAnnotations`               | Backend pod annotations                                                                                                                                       | `{}`                 |
| `frontend.deploymentAnnotations`        | Backend deployment annotations                                                                                                                                | `{}`                 |
| `frontend.replicaCount`                 | Backend replica count                                                                                                                                         | `2`                  |
| `frontend.image.repository`             | Backend image repository                                                                                                                                      | `infisical/frontend` |
| `frontend.image.tag`                    | Backend image tag                                                                                                                                             | `latest`             |
| `frontend.image.pullPolicy`             | Backend image pullPolicy                                                                                                                                      | `IfNotPresent`       |
| `frontend.kubeSecretRef`                | Backend secret resource reference name (containing required [frontend configuration variables](https://infisical.com/docs/self-hosting/configuration/envars)) | `""`                 |
| `frontend.service.annotations`          | Backend service annotations                                                                                                                                   | `{}`                 |
| `frontend.service.type`                 | Backend service type                                                                                                                                          | `ClusterIP`          |
| `frontend.service.nodePort`             | Backend service nodePort (used if above type is `NodePort`)                                                                                                   | `""`                 |
| `frontendEnvironmentVariables.SITE_URL` | Absolute URL including the protocol (e.g. https://app.infisical.com)                                                                                          | `infisical.local`    |


### Infisical backend parameters

| Name                                             | Description                                                                                                                                                  | Value               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `backend.enabled`                                | Enable backend                                                                                                                                               | `true`              |
| `backend.name`                                   | Backend name                                                                                                                                                 | `backend`           |
| `backend.fullnameOverride`                       | Backend fullnameOverride                                                                                                                                     | `""`                |
| `backend.podAnnotations`                         | Backend pod annotations                                                                                                                                      | `{}`                |
| `backend.deploymentAnnotations`                  | Backend deployment annotations                                                                                                                               | `{}`                |
| `backend.replicaCount`                           | Backend replica count                                                                                                                                        | `2`                 |
| `backend.image.repository`                       | Backend image repository                                                                                                                                     | `infisical/backend` |
| `backend.image.tag`                              | Backend image tag                                                                                                                                            | `latest`            |
| `backend.image.pullPolicy`                       | Backend image pullPolicy                                                                                                                                     | `IfNotPresent`      |
| `backend.kubeSecretRef`                          | Backend secret resource reference name (containing required [backend configuration variables](https://infisical.com/docs/self-hosting/configuration/envars)) | `""`                |
| `backend.service.annotations`                    | Backend service annotations                                                                                                                                  | `{}`                |
| `backend.service.type`                           | Backend service type                                                                                                                                         | `ClusterIP`         |
| `backend.service.nodePort`                       | Backend service nodePort (used if above type is `NodePort`)                                                                                                  | `""`                |
| `backendEnvironmentVariables.ENCRYPTION_KEY`     | **Required** Backend encryption key (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))                                  | `MUST_REPLACE`      |
| `backendEnvironmentVariables.JWT_SIGNUP_SECRET`  | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))                              | `MUST_REPLACE`      |
| `backendEnvironmentVariables.JWT_REFRESH_SECRET` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))                              | `MUST_REPLACE`      |
| `backendEnvironmentVariables.JWT_AUTH_SECRET`    | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))                              | `MUST_REPLACE`      |
| `backendEnvironmentVariables.JWT_SERVICE_SECRET` | **Required** Secrets to sign JWT tokens (128-bit hex value, 32-characters hex, [example](https://stackoverflow.com/a/34329057))                              | `MUST_REPLACE`      |
| `backendEnvironmentVariables.SMTP_HOST`          | **Required** Hostname to connect to for establishing SMTP connections                                                                                        | `MUST_REPLACE`      |
| `backendEnvironmentVariables.SMTP_PORT`          | Port to connect to for establishing SMTP connections                                                                                                         | `587`               |
| `backendEnvironmentVariables.SMTP_SECURE`        | If true, use TLS when connecting to host. If false, TLS will be used if STARTTLS is supported                                                                | `false`             |
| `backendEnvironmentVariables.SMTP_FROM_NAME`     | Name label to be used in From field (e.g. Infisical)                                                                                                         | `Infisical`         |
| `backendEnvironmentVariables.SMTP_FROM_ADDRESS`  | **Required** Email address to be used for sending emails (e.g. dev@infisical.com)                                                                            | `MUST_REPLACE`      |
| `backendEnvironmentVariables.SMTP_USERNAME`      | **Required** Credential to connect to host (e.g. team@infisical.com)                                                                                         | `MUST_REPLACE`      |
| `backendEnvironmentVariables.SMTP_PASSWORD`      | **Required** Credential to connect to host                                                                                                                   | `MUST_REPLACE`      |
| `backendEnvironmentVariables.SITE_URL`           | Absolute URL including the protocol (e.g. https://app.infisical.com)                                                                                         | `infisical.local`   |


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
| `mongodb.service.annotations`                       | Service annotations                                                                                                                                                                       | `{}`                 |
| `mongodb.auth.enabled`                              | Enable custom authentication                                                                                                                                                              | `true`               |
| `mongodb.auth.usernames`                            | Custom usernames list ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format))                                  | `["infisical"]`      |
| `mongodb.auth.passwords`                            | Custom passwords list, match the above usernames order ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format)) | `["infisical"]`      |
| `mongodb.auth.databases`                            | Custom databases list ([special characters warning](https://www.mongodb.com/docs/manual/reference/connection-string/#standard-connection-string-format))                                  | `["infisical"]`      |
| `mongodb.persistence.enabled`                       | Enable database persistence                                                                                                                                                               | `true`               |
| `mongodb.persistence.existingClaim`                 | Existing persistent volume claim name                                                                                                                                                     | `""`                 |
| `mongodb.persistence.resourcePolicy`                | Keep the persistent volume even on deletion (`keep` or `""`)                                                                                                                              | `keep`               |
| `mongodb.persistence.accessModes`                   | Persistent volume access modes                                                                                                                                                            | `["ReadWriteOnce"]`  |
| `mongodb.persistence.size`                          | Persistent storage request size                                                                                                                                                           | `8Gi`                |
| `mongodbConnection.externalMongoDBConnectionString` | External MongoDB connection string                                                                                                                                                        | `""`                 |


### Ingress parameters

| Name               | Description                                 | Value             |
| ------------------ | ------------------------------------------- | ----------------- |
| `ingress.enabled`  | Enable ingress                              | `true`            |
| `ingress.hostName` | Ingress hostname (your custom domain name)  | `infisical.local` |
| `ingress.tls`      | Ingress TLS hosts (matching above hostName) | `[]`              |


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


## Persistence

The database persistence is enabled by default, your volumes will remain on your cluster even after uninstalling the chart. To disable persistence, set this value `mongodb.persistence.enabled: false`

## Local development

Use below values if you want to setup a local development environment, and adapt those variables as you need. Below example will deploy the following :
- https://infisical.local
  - Your local Infisical instance
  - You may have to add `infisical.local` to your `/etc/hosts` or similar depending your OS
- https://mailhog.infisical.local
  - Local SMTP server used to receive the signup verification code
  - You may have to add `mailhog.infisical.local` to your `/etc/hosts` or similar depending your OS

```yaml
# values.dev.yaml

# Enable all services for local development
frontend:
    enabled: true
backend:
    enabled: true
mongodb:
    enabled: true
mailhog:
    enabled: true

# Configure backend development variables
backendEnvironmentVariables:
  ENCRYPTION_KEY: 6c1fe4e407b8911c104518103505b218
  JWT_AUTH_SECRET: 4be6ba5602e0fa0ac6ac05c3cd4d247f
  JWT_REFRESH_SECRET: 5f2f3c8f0159068dc2bbb3a652a716ff
  JWT_SERVICE_SECRET: f32f716d70a42c5703f4656015e76200
  JWT_SIGNUP_SECRET: 3679e04ca949f914c03332aaaeba805a
  SITE_URL: https://infisical.local
  SMTP_FROM_ADDRESS: dev@infisical.local
  SMTP_FROM_NAME: Local Infisical
  SMTP_HOST: mailhog
  SMTP_PASSWORD: ""
  SMTP_PORT: 1025
  SMTP_SECURE: false
  SMTP_USERNAME: dev@infisical.local

# Configure frontend development variables
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

### 1.15.0

Refactoring in progress, instructions are coming soon