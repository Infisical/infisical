# Dynamic Secrets: SSH Certificates & Kubernetes

## SSH Certificates

### Overview
Infisical generates an internal CA key pair and issues signed SSH certificates on demand. Target hosts trust the CA, and certificates expire automatically — no manual key rotation or revocation needed.

### How It Works
1. When you create the dynamic secret, Infisical generates a CA key pair
2. You configure target SSH servers to trust this CA
3. For each lease, Infisical generates an ephemeral key pair, signs it with the CA, and returns the private key + signed certificate
4. The certificate automatically expires when the lease TTL is up

### Configuration
| Field | Required | Description |
|-------|----------|-------------|
| Secret Name | Yes | Name for this dynamic secret |
| Default TTL | Yes | Default certificate validity (e.g., `1h`, `8h`) |
| Max TTL | Yes | Maximum certificate validity |
| Allowed Principals | Yes | Usernames the cert can authenticate as (e.g., `ubuntu`, `deploy`, `root`) |
| Key Algorithm | Yes | `ED25519` (default, recommended), `RSA 2048`, `RSA 4096`, `ECDSA P-256`, or `ECDSA P-384` |

### Target Host Setup

After creating the dynamic secret, you get a setup modal with two options:

**Automated (recommended):**
```bash
curl -H "Authorization: Bearer <token>" \
  "https://<infisical-url>/api/v1/dynamic-secrets/ssh-ca-setup/<id>" | sudo bash
```
This writes the CA to `/etc/ssh/infisical_ca.pub`, adds `TrustedUserCAKeys` to sshd_config, and restarts SSH.

**Manual:**
1. Save the CA public key to `/etc/ssh/infisical_ca.pub`
2. Add to `/etc/ssh/sshd_config`:
   ```
   TrustedUserCAKeys /etc/ssh/infisical_ca.pub
   ```
3. Restart SSH: `sudo systemctl restart sshd`

### Lease Generation
- Specify TTL (within Max TTL)
- Specify principals (subset of Allowed Principals)

### Lease Returns
- **Private Key** (downloadable as `key.pem`)
- **Signed Certificate** (downloadable as `cert.pub`)

### Usage
```bash
chmod 600 key.pem
ssh -i key.pem -o CertificateFile=cert.pub <principal>@<hostname>
```

### Gotchas
- **Certificates CANNOT be renewed.** The TTL is baked in at signing time. Create a new lease for a fresh certificate.
- Certificates remain valid until TTL even if the lease is revoked in Infisical
- Use short TTLs for security-sensitive environments

---

## Kubernetes Service Account Tokens

### Overview
Generate short-lived Kubernetes service account tokens on demand. Supports two credential types and two authentication methods.

### Credential Types

**Static** — Use an existing service account with predefined permissions. Infisical generates a token for it.

**Dynamic** — Infisical creates a temporary service account, binds it to a specified role, generates a token, and cleans up when the lease expires.

### Authentication Methods

**Token (API)** — Provide a cluster URL and a service account token with RBAC permissions to create tokens.

**Gateway** — Use an Infisical Gateway deployed in the cluster (for private clusters).

### Static Credentials + Token Auth

**RBAC Setup (apply to cluster):**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: infisical-token-requester
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: tokenrequest
rules:
  - apiGroups: [""]
    resources: ["serviceaccounts/token", "serviceaccounts"]
    verbs: ["create", "get"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: tokenrequest
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: tokenrequest
subjects:
  - kind: ServiceAccount
    name: infisical-token-requester
    namespace: default
```

**Get the token:**
```bash
kubectl get secret infisical-token-requester-token -n default \
  -o=jsonpath='{.data.token}' | base64 --decode
```

**Config:**
| Field | Required | Description |
|-------|----------|-------------|
| Cluster URL | Yes | e.g., `https://kubernetes.default.svc` |
| Cluster Token | Yes | Token from RBAC setup above |
| Service Account Name | Yes | Existing SA to generate tokens for |
| Namespace | Yes | SA's namespace |
| Audiences | No | Token audiences |

### Dynamic Credentials + Token Auth

Requires expanded RBAC (create/delete service accounts + role bindings):

```yaml
rules:
  - apiGroups: [""]
    resources: ["serviceaccounts/token", "serviceaccounts"]
    verbs: ["create", "get", "delete"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["rolebindings", "clusterrolebindings"]
    verbs: ["create", "delete"]
```

**Important:** The token requester SA can only create bindings for roles it has access to itself.

**Config:**
| Field | Required | Description |
|-------|----------|-------------|
| Cluster URL | Yes | Kubernetes API server URL |
| Cluster Token | Yes | Token with expanded RBAC |
| Allowed Namespaces | Yes | Comma-separated (e.g., `default,kube-system`) |
| Role Type | Yes | `ClusterRole` or `Role` |
| Role | Yes | Name of the role to bind |
| Audiences | No | Token audiences |

### Lease Returns
- Kubernetes service account token (JWT)

### Gotchas
- **Tokens CANNOT be revoked.** Like GCP, K8s tokens are JWTs with baked-in expiration. Revoking the lease removes the Infisical record but the token stays valid until expiry.
- **Tokens CANNOT be renewed.** The lifetime is fixed at creation. Create a new lease for a new token.
- Use short TTLs (15m–1h) for security
- Dynamic credentials create temporary service accounts that are automatically cleaned up on lease expiry
- Gateway auth eliminates the need to expose the cluster API server publicly
