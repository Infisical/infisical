# infisical-standalone

![Version: 1.0.7](https://img.shields.io/badge/Version-1.0.7-informational?style=flat-square) ![Type: application](https://img.shields.io/badge/Type-application-informational?style=flat-square) ![AppVersion: 1.0.0](https://img.shields.io/badge/AppVersion-1.0.0-informational?style=flat-square)

A helm chart for a full Infisical application

## Requirements

| Repository | Name | Version |
|------------|------|---------|
| https://charts.bitnami.com/bitnami | postgresql | 14.1.3 |
| https://charts.bitnami.com/bitnami | redis | 18.14.0 |
| https://kubernetes.github.io/ingress-nginx | ingress-nginx | 4.0.13 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| fullnameOverride | string | `""` |  |
| infisical.affinity | object | `{}` |  |
| infisical.autoDatabaseSchemaMigration | bool | `true` |  |
| infisical.deploymentAnnotations | object | `{}` |  |
| infisical.enabled | bool | `true` |  |
| infisical.fullnameOverride | string | `""` |  |
| infisical.image.pullPolicy | string | `"IfNotPresent"` |  |
| infisical.image.repository | string | `"infisical/infisical"` |  |
| infisical.image.tag | string | `"v0.46.3-postgres"` |  |
| infisical.kubeSecretRef | string | `"infisical-secrets"` |  |
| infisical.name | string | `"infisical"` |  |
| infisical.podAnnotations | object | `{}` |  |
| infisical.replicaCount | int | `2` |  |
| infisical.resources.limits.memory | string | `"350Mi"` |  |
| infisical.resources.requests.cpu | string | `"350m"` |  |
| infisical.service.annotations | object | `{}` |  |
| infisical.service.nodePort | string | `""` |  |
| infisical.service.type | string | `"ClusterIP"` |  |
| infisical.waitHelperImage | string | `"ghcr.io/groundnuty/k8s-wait-for:no-root-v2.0"` |  |
| ingress.annotations | object | `{}` |  |
| ingress.enabled | bool | `true` |  |
| ingress.hostName | string | `""` |  |
| ingress.ingressClassName | string | `"nginx"` |  |
| ingress.nginx.enabled | bool | `true` |  |
| ingress.tls | list | `[]` |  |
| nameOverride | string | `""` |  |
| postgresql.auth.database | string | `"infisicalDB"` |  |
| postgresql.auth.password | string | `"root"` |  |
| postgresql.auth.username | string | `"infisical"` |  |
| postgresql.enabled | bool | `true` |  |
| postgresql.fullnameOverride | string | `"postgresql"` |  |
| postgresql.name | string | `"postgresql"` |  |
| redis.architecture | string | `"standalone"` |  |
| redis.auth.password | string | `"mysecretpassword"` |  |
| redis.cluster.enabled | bool | `false` |  |
| redis.enabled | bool | `true` |  |
| redis.fullnameOverride | string | `"redis"` |  |
| redis.name | string | `"redis"` |  |
| redis.usePassword | bool | `true` |  |

