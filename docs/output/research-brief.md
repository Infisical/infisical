# Research Brief

## Topic
Integrating Infisical with the External Secrets Operator (ESO) using Kubernetes Auth.

## Summary
External Secrets Operator is a Kubernetes operator that syncs secrets from external providers (including Infisical) into native Kubernetes Secrets. Infisical is a supported ESO provider. This guide covers using Kubernetes Auth — a Kubernetes-native authentication method where pods authenticate with Infisical using their service account JWT tokens — to connect ESO to Infisical.

## Audience
Platform engineers and DevOps engineers who manage Kubernetes clusters and want to sync Infisical secrets into Kubernetes workloads using ESO.

## Technical Details

### Infisical Kubernetes Auth (from repo)

**How it works:**
1. A pod retrieves its service account JWT token from `/var/run/secrets/kubernetes.io/serviceaccount/token`.
2. The token is sent to Infisical at `POST /api/v1/auth/kubernetes-auth/login` with `{ identityId, jwt }`.
3. Infisical forwards the JWT to the Kubernetes API Server's TokenReview API for validation.
4. Infisical checks the service account against allowed names and namespaces.
5. If valid, Infisical returns a short-lived access token.

**Login endpoint:**
- `POST /api/v1/auth/kubernetes-auth/login`
- Body: `{ identityId: string, jwt: string }`
- Response: `{ accessToken: string, expiresIn: number, accessTokenMaxTTL: number, tokenType: "Bearer" }`

**Identity configuration fields:**
- Kubernetes Host / Base Kubernetes API URL
- Token Reviewer JWT (optional — if omitted, client's own JWT is used)
- Allowed Service Account Names (comma-separated)
- Allowed Namespaces (comma-separated)
- Allowed Audience (optional)
- CA Certificate (PEM-encoded, for TLS with K8s API server)
- Access Token TTL (default: 2592000 seconds / 30 days)
- Access Token Max TTL (default: 2592000 seconds / 30 days)
- Access Token Max Number of Uses (default: 0 = unlimited)
- Access Token Trusted IPs (default: 0.0.0.0/0)

**Token Reviewer options:**
1. Dedicated reviewer service account with `system:auth-delegator` ClusterRole
2. Client JWT as reviewer (each app SA needs `system:auth-delegator`)
3. Gateway as reviewer (enterprise feature)

Source: `documentation/platform/identities/kubernetes-auth.mdx`

### ESO Infisical Provider (from external docs)

**SecretStore spec for Kubernetes Auth:**
```yaml
apiVersion: external-secrets.io/v1
kind: SecretStore
metadata:
  name: infisical
spec:
  provider:
    infisical:
      hostAPI: https://app.infisical.com
      auth:
        kubernetesAuthCredentials:
          identityId:
            name: <secret-name>
            key: identityId
      secretsScope:
        projectSlug: my-project
        environmentSlug: dev
        secretsPath: /
        recursive: false
        expandSecretReferences: true
```

The `identityId` is referenced from a Kubernetes Secret. The `serviceAccountTokenPath` field exists but defaults to the standard path.

[EXTERNAL: https://external-secrets.io/latest/provider/infisical/]

**ExternalSecret to fetch individual secrets:**
```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
metadata:
  name: infisical-managed-secrets
spec:
  secretStoreRef:
    kind: SecretStore
    name: infisical
  target:
    name: my-k8s-secret
  data:
    - secretKey: API_KEY
      remoteRef:
        key: API_KEY
```

**ExternalSecret to fetch all secrets:**
```yaml
apiVersion: external-secrets.io/v1
kind: ExternalSecret
spec:
  secretStoreRef:
    kind: SecretStore
    name: infisical
  target:
    name: my-k8s-secret
  dataFrom:
    - find:
        name:
          regexp: .*
```

[EXTERNAL: https://external-secrets.io/latest/provider/infisical/]

**secretsScope fields:**
| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| projectSlug | Yes | — | Slug identifier for Infisical project |
| environmentSlug | Yes | — | Environment identifier (dev, staging, prod) |
| secretsPath | No | `/` | Base path for secrets retrieval |
| recursive | No | false | Fetch secrets from subfolders |
| expandSecretReferences | No | true | Expand `${SECRET_NAME}` references |

### ESO Installation
```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets \
  external-secrets/external-secrets \
  -n external-secrets \
  --create-namespace
```
[EXTERNAL: https://external-secrets.io/latest/introduction/getting-started/]

## Prerequisites
- A Kubernetes cluster (v1.16+)
- Helm installed
- An Infisical account with a project containing secrets
- kubectl access to the cluster

## Related Resources
- [Kubernetes Auth](/documentation/platform/identities/kubernetes-auth)
- [Machine Identities](/documentation/platform/identities/machine-identities)
- [Infisical Kubernetes Operator](/integrations/platforms/kubernetes/overview) (alternative approach)
- [Kubernetes CSI Provider](/integrations/platforms/kubernetes-csi) (alternative approach)
- [Fetching Secrets overview](/documentation/platform/secrets-mgmt/concepts/secrets-delivery)

## Flagged Items
- [VERIFY] The ESO Infisical provider YAML uses `external-secrets.io/v1` as the apiVersion. Confirm this is the current stable version — older ESO versions may use `external-secrets.io/v1beta1`.
- [ASSUMED] The `serviceAccountTokenPath` field in the ESO Kubernetes auth config defaults to `/var/run/secrets/kubernetes.io/serviceaccount/token` and does not need to be explicitly set in most cases.

## Sources
- `docs/documentation/platform/identities/kubernetes-auth.mdx` (Infisical Kubernetes Auth guide)
- `docs/documentation/platform/identities/machine-identities.mdx` (Machine Identity concepts)
- `backend/src/server/routes/v1/identity-kubernetes-auth-router.ts` (login endpoint schema)
- https://external-secrets.io/latest/provider/infisical/ (ESO Infisical provider)
- https://external-secrets.io/latest/introduction/getting-started/ (ESO installation)
