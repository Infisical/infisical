# Kubernetes Operator

The Infisical Secrets Operator syncs secrets from Infisical into Kubernetes Secrets, so pods can consume them as env vars or volume mounts without application-level SDK integration.

## Supported versions

Kubernetes: 1.29 – 1.33. Distributions: EKS, GKE, AKS, OKE, OpenShift.

## Installation

```bash
# Add the Helm repo
helm repo add infisical-helm-charts 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
helm repo update

# Cluster-wide install
helm install --generate-name infisical-helm-charts/secrets-operator

# Namespace-scoped install (if you want to limit the operator's reach)
helm install operator-namespaced infisical-helm-charts/secrets-operator \
  --namespace my-namespace \
  --set scopedNamespaces=my-namespace \
  --set scopedRBAC=true
```

## Connecting to Infisical

By default the operator talks to `https://app.infisical.com/api`. For self-hosted instances, configure via ConfigMap:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: infisical-config
  namespace: infisical-operator-system
data:
  hostAPI: https://your-instance.com/api
```

For in-cluster Infisical: `http://<service-name>.<namespace>.svc.cluster.local:4000/api`

For custom/self-signed CA certificates:

```yaml
data:
  hostAPI: https://your-instance.com/api
  tls.caRef.secretName: custom-ca-certificate
  tls.caRef.secretNamespace: default
  tls.caRef.key: ca.crt
```

## CRD 1: InfisicalSecret (pull secrets into K8s)

This is the most common use case — syncing secrets from Infisical into a Kubernetes Secret.

### Step 1: Create auth credentials

```bash
kubectl create secret generic universal-auth-credentials \
  --from-literal=clientId="<your-client-id>" \
  --from-literal=clientSecret="<your-client-secret>"
```

**Important**: The user should create their own machine identity and credentials in the Infisical dashboard. Never generate these on their behalf.

### Step 2: Create the InfisicalSecret resource

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
spec:
  hostAPI: https://app.infisical.com/api
  syncConfig:
    resyncInterval: 60s
    instantUpdates: false

  authentication:
    universalAuth:
      secretsScope:
        projectSlug: my-project
        envSlug: prod
        secretsPath: "/"
      credentialsRef:
        secretName: universal-auth-credentials
        secretNamespace: default

  managedKubeSecretReferences:
    - secretName: my-app-managed-secret
      secretNamespace: default
      creationPolicy: "Orphan"
```

### Step 3: Use in your deployment

```yaml
envFrom:
  - secretRef:
      name: my-app-managed-secret
```

### Auth methods for Kubernetes

**Universal Auth** (shown above) — simplest, works anywhere.

**Kubernetes Auth** (recommended for K8s) — zero-secret, uses pod service account tokens:

1. Create a token reviewer service account with `system:auth-delegator` role
2. Create a service account for your workload
3. Configure the identity with Kubernetes Auth in the Infisical dashboard
4. Reference in the CRD:

```yaml
authentication:
  kubernetesAuth:
    identityId: <identity-id>
    secretsScope:
      projectSlug: my-project
      envSlug: prod
      secretsPath: "/"
    serviceAccountRef:
      name: my-service-account
      namespace: default
```

With `autoCreateServiceAccountToken: true`, the operator handles token lifecycle automatically.

### Resync interval

- Default: 1 minute (if instantUpdates=false), 1 hour (if instantUpdates=true)
- Minimum: 5 seconds
- Format: `[number][unit]` — `s`, `m`, `h`, `d`, `w`

### Templating

Use Go templates with Sprig functions to transform secrets:

```yaml
managedKubeSecretReferences:
  - secretName: my-tls-secret
    secretNamespace: default
    template:
      data:
        tls.crt: "{{ .secrets.TLS_CERT | b64dec }}"
        tls.key: "{{ .secrets.TLS_KEY | b64dec }}"
```

## CRD 2: InfisicalPushSecret (push K8s secrets to Infisical)

Pushes secrets from Kubernetes into Infisical — useful for bootstrapping or migration.

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalPushSecret
metadata:
  name: push-to-infisical
spec:
  resyncInterval: 1m
  hostAPI: https://app.infisical.com/api
  updatePolicy: Replace   # None (skip if exists) or Replace (overwrite)
  deletionPolicy: Delete  # None (leave in Infisical) or Delete (remove when CRD deleted)

  destination:
    projectId: <project-id>
    environmentSlug: prod
    secretsPath: /

  push:
    secret:
      secretName: my-k8s-secret
      secretNamespace: default

  authentication:
    universalAuth:
      credentialsRef:
        secretName: universal-auth-credentials
        secretNamespace: default
```

## CRD 3: InfisicalDynamicSecret (dynamic secret leases)

Generates short-lived credentials (e.g., database passwords) and syncs them to K8s:

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalDynamicSecret
metadata:
  name: dynamic-db-creds
spec:
  hostAPI: https://app.infisical.com/api

  dynamicSecret:
    secretName: postgres-dynamic
    projectId: <project-id>
    secretsPath: /
    environmentSlug: prod

  leaseRevocationPolicy: Revoke  # Revoke lease when CRD is deleted
  leaseTTL: 30m                  # Max 24h

  managedSecretReference:
    secretName: db-credentials
    secretNamespace: default
    creationPolicy: Orphan

  authentication:
    universalAuth:
      credentialsRef:
        secretName: universal-auth-credentials
        secretNamespace: default
```

The operator automatically rotates the lease before expiration.

## Monitoring

The operator exposes Prometheus metrics. Enable ServiceMonitor:

```yaml
# In Helm values
telemetry:
  serviceMonitor:
    enabled: true
    interval: 30s
```

Key metrics: `controller_runtime_reconcile_total`, `controller_runtime_reconcile_errors_total`, `controller_runtime_reconcile_time_seconds`.

## Troubleshooting

Check the status of an InfisicalSecret:

```bash
kubectl get infisicalsecret my-app-secrets -o yaml
```

Look at `status.conditions` for error details. Common issues: wrong project slug, missing permissions on the machine identity, credentials secret not found.
