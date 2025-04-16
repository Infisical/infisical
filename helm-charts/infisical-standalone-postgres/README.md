# infisical-standalone

![Version: 1.4.0](https://img.shields.io/badge/Version-1.4.0-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.0.1](https://img.shields.io/badge/AppVersion-1.0.1-informational?style=flat-square)

A helm chart to deploy Infisical

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 14.1.3 |
| https://charts.bitnami.com/bitnami | redis | 18.14.0 |
| https://kubernetes.github.io/ingress-nginx | ingress-nginx | 4.0.13 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| fullnameOverride | string | `""` | Overrides the full name of the release, affecting resource names |
| infisical.affinity | object | `{}` | Node affinity settings for pod placement |
| infisical.autoDatabaseSchemaMigration | bool | `true` | Automatically migrates new database schema when deploying |
| infisical.databaseSchemaMigrationJob.image.pullPolicy | string | `"IfNotPresent"` | Pulls image only if not present on the node |
| infisical.databaseSchemaMigrationJob.image.repository | string | `"ghcr.io/groundnuty/k8s-wait-for"` | Image repository for migration wait job |
| infisical.databaseSchemaMigrationJob.image.tag | string | `"no-root-v2.0"` | Image tag version |
| infisical.deploymentAnnotations | object | `{}` | Custom annotations for Infisical deployment |
| infisical.enabled | bool | `true` |  |
| infisical.fullnameOverride | string | `""` | Override for the full name of Infisical resources in this deployment |
| infisical.image.imagePullSecrets | list | `[]` | Secret references for pulling the image, if needed |
| infisical.image.pullPolicy | string | `"IfNotPresent"` | Pulls image only if not already present on the node |
| infisical.image.repository | string | `"infisical/infisical"` | Image repository for the Infisical service |
| infisical.image.tag | string | `"v0.93.1-postgres"` | Specific version tag of the Infisical image. View the latest version here https://hub.docker.com/r/infisical/infisical |
| infisical.kubeSecretRef | string | `"infisical-secrets"` | Kubernetes Secret reference containing Infisical root credentials |
| infisical.name | string | `"infisical"` |  |
| infisical.podAnnotations | object | `{}` | Custom annotations for Infisical pods |
| infisical.replicaCount | int | `2` | Number of pod replicas for high availability |
| infisical.resources.limits.memory | string | `"600Mi"` | Memory limit for Infisical container |
| infisical.resources.requests.cpu | string | `"350m"` | CPU request for Infisical container |
| infisical.service.annotations | object | `{}` | Custom annotations for Infisical service |
| infisical.service.nodePort | string | `""` | Optional node port for service when using NodePort type |
| infisical.service.type | string | `"ClusterIP"` | Service type, can be changed based on exposure needs (e.g., LoadBalancer) |
| infisical.serviceAccount.annotations | object | `{}` | Custom annotations for the auto-created service account |
| infisical.serviceAccount.create | bool | `true` | Creates a new service account if true, with necessary permissions for this chart. If false and `serviceAccount.name` is not defined, the chart will attempt to use the Default service account |
| infisical.serviceAccount.name | string | `nil` | Optional custom service account name, if existing service account is used |
| ingress.annotations | object | `{}` | Custom annotations for ingress resource |
| ingress.enabled | bool | `true` | Enable or disable ingress configuration |
| ingress.hostName | string | `""` | Hostname for ingress access, e.g., app.example.com |
| ingress.ingressClassName | string | `"nginx"` | Specifies the ingress class, useful for multi-ingress setups |
| ingress.nginx.enabled | bool | `true` | Enable NGINX-specific settings, if using NGINX ingress controller |
| ingress.tls | list | `[]` | TLS settings for HTTPS access |
| nameOverride | string | `""` | Overrides the default release name |
| postgresql.auth.database | string | `"infisicalDB"` | Database name for Infisical |
| postgresql.auth.password | string | `"root"` | Password for PostgreSQL database access |
| postgresql.auth.username | string | `"infisical"` | Database username for PostgreSQL |
| postgresql.enabled | bool | `true` | Enables an in-cluster PostgreSQL deployment. To achieve HA for Postgres, we recommend deploying https://github.com/zalando/postgres-operator instead. |
| postgresql.fullnameOverride | string | `"postgresql"` | Full name override for PostgreSQL resources |
| postgresql.name | string | `"postgresql"` | PostgreSQL resource name |
| postgresql.customURIParameters.enabled | bool | `false` | Set to true if using custom URI parameters for PostgreSQL connection |
| postgresql.customURIParameters.username | string | `""` | Username for PostgreSQL connection |
| postgresql.customURIParameters.passwordSecret.key | string | `""` | Key name in the Kubernetes secret that holds the PostgreSQL password |
| postgresql.customURIParameters.passwordSecret.name | string | `""` | Kubernetes secret name containing the PostgreSQL password |
| postgresql.customURIParameters.host | string | `""` | Hostname for PostgreSQL connection |
| postgresql.customURIParameters.port | string | `"5432"` | Port for PostgreSQL connection. Default is 5432 |
| postgresql.customURIParameters.database | string | `""` | Database name for PostgreSQL connection |
| postgresql.customURIParameters.ssl.enabled | bool | `false` | Set to true if using SSL for PostgreSQL connection |
| postgresql.customURIParameters.ssl.mode | string | `"verify-ca"` | SSL mode for PostgreSQL connection. Default is "verify-ca" |
| postgresql.customURIParameters.ssl.rootCertPath | string | `""` | Path to the Root CA certificate file for SSL connection |
| postgresql.useExistingPostgresSecret.enabled | bool | `false` | Set to true if using an existing Kubernetes secret that contains PostgreSQL connection string |
| postgresql.useExistingPostgresSecret.existingConnectionStringSecret.key | string | `""` | Key name in the Kubernetes secret that holds the connection string |
| postgresql.useExistingPostgresSecret.existingConnectionStringSecret.name | string | `""` | Kubernetes secret name containing the PostgreSQL connection string |
| redis.architecture | string | `"standalone"` | Redis deployment type (e.g., standalone or cluster) |
| redis.auth.password | string | `"mysecretpassword"` | Redis password |
| redis.cluster.enabled | bool | `false` | Clustered Redis deployment |
| redis.enabled | bool | `true` | Enables an in-cluster Redis deployment |
| redis.fullnameOverride | string | `"redis"` | Full name override for Redis resources |
| redis.name | string | `"redis"` | Redis resource name |
| redis.usePassword | bool | `true` | Requires a password for Redis authentication |
| redis.customURIParameters.enabled | bool | `false` | Set to true if using custom URI parameters for Redis connection |
| redis.customURIParameters.username | string | `""` | Optional username for Redis authentication |
| redis.customURIParameters.passwordSecret.key | string | `""` | Key name in the Kubernetes secret that holds the Redis password |
| redis.customURIParameters.passwordSecret.name | string | `""` | Kubernetes secret name containing the Redis password |
| redis.customURIParameters.host | string | `""` | Redis host |
| redis.customURIParameters.port | number | `6379` | Port for Redis connection. Default is 6379 |
| redis.useExistingRedisSecret.enabled | bool | `false` | Set to true if using a custom Redis connection |
