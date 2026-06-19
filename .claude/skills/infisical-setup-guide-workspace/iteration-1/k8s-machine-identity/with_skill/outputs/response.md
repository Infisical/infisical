# Kubernetes Machine Identity Setup for Infisical

## Quick Answer

For Kubernetes pods pulling secrets from Infisical, use **Kubernetes Auth** — it's the best choice because it's zero-secret (no credentials to manage), leverages your existing service account infrastructure, and is specifically designed for K8s workloads.

---

## Why Kubernetes Auth?

| Method | Requires Secret | Zero-Proof | Best for |
|--------|-----------------|-----------|----------|
| **Kubernetes Auth** | No | Yes | K8s pods (the pod's SA JWT proves identity) |
| Universal Auth | Yes | No | Multi-platform, needs Client ID/Secret |
| Token Auth | Yes | No | Quick testing, less secure |
| AWS Auth | No | Yes | Only if running on EKS with IAM roles |
| OIDC Auth | No | Yes | Only if you have an external OIDC provider |

**Recommendation**: Use **Kubernetes Auth** unless you have a specific reason not to.

---

## Architecture: How Kubernetes Auth Works

1. **Pod requests secret** from your app
2. **App reads pod's service account JWT** from `/var/run/secrets/kubernetes.io/serviceaccount/token` (automatically mounted)
3. **App sends JWT to Infisical** via `POST /api/v1/auth/kubernetes-auth/login`
4. **Infisical verifies JWT** against the Kubernetes API server using TokenReview (requires cluster CA cert + service account token)
5. **Infisical returns short-lived access token** (default 2 hours)
6. **App uses token** to fetch secrets

**Key benefit**: The pod's identity is cryptographically proven via the service account JWT. No static secrets stored in your deployment.

---

## Setup Steps

### Step 1: Prepare Kubernetes Prerequisites

Infisical needs two pieces of information about your K8s cluster:

1. **Kubernetes API Server URL** — usually `https://kubernetes.default.svc` (or your external cluster URL)
2. **Service Account with TokenReview permission** — creates a token that Infisical uses to verify other service account JWTs

**Create the token reviewer service account:**

```bash
# Apply this to your cluster
kubectl apply -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: infisical-token-reviewer
  namespace: default
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: infisical-token-reviewer
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
- kind: ServiceAccount
  name: infisical-token-reviewer
  namespace: default
EOF
```

**Get the token (you'll need this in Step 3):**

```bash
kubectl create token infisical-token-reviewer --duration=87600h
```

This token allows Infisical to verify other service account JWTs via the Kubernetes API.

### Step 2: Create a Machine Identity in Infisical

Go to Infisical UI:

1. **Organization Settings** → **Access Control** → **Machine Identities**
2. Click **Create Identity**
3. Give it a name like `k8s-pod-identity`
4. Assign an **organization role** (e.g., Editor if this identity needs broad access, or a custom role)
5. Click **Create**

(Alternatively, create at **Project Level** in Project Settings → Access Control → Machine Identities if you want to scope it to one project.)

### Step 3: Configure Kubernetes Auth Method

After creating the identity:

1. In the identity details, go to **Auth Method** → **Add Method** (if not already present)
2. Select **Kubernetes Auth**
3. Fill in:
   - **Kubernetes Host URL**: `https://kubernetes.default.svc` (or your external API server URL)
   - **CA Certificate**: The Kubernetes cluster's CA cert. Get it from:
     ```bash
     kubectl get secret $(kubectl get secret -n default | grep infisical-token-reviewer | awk '{print $1}') \
       -n default -o jsonpath='{.data.ca\.crt}' | base64 -d
     ```
     Or from your kubeconfig at `.clusters[].cluster.certificate-authority-data` (base64 decode it)
   - **Token Reviewer JWT**: Paste the token from Step 1
   - **Allowed Namespaces**: `default` (or comma-separated list: `default,production,staging`)
   - **Allowed Service Account Names**: Your pod's service account name (e.g., `my-app`, or `*` to allow any)
   - **Allowed Audiences** (optional): Leave blank or set to your Infisical instance hostname

4. Click **Save**

### Step 4: Grant Project Access (if org-level identity)

If your identity is organization-level, add it to the project(s) where it needs secret access:

1. Go to **Project Settings** → **Access Control** → **Machine Identities**
2. Click **Add Identity**
3. Select your `k8s-pod-identity`
4. Assign a **project role** (e.g., Viewer if it only needs to read secrets)
5. Click **Add**

### Step 5: Configure Your Pod

In your Kubernetes deployment, ensure the pod runs with the correct service account and can reach Infisical:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  template:
    spec:
      serviceAccountName: my-app  # Must match "Allowed Service Account Names" from Step 3
      containers:
      - name: my-app
        image: my-app:latest
        env:
        - name: INFISICAL_ADDR
          value: "https://infisical.example.com"  # Your Infisical URL
        - name: INFISICAL_IDENTITY_ID
          value: "<identity-id>"  # From Step 2
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: default
```

### Step 6: Authenticate from Your App

In your application code, authenticate with Infisical using the pod's service account JWT:

**Example (Node.js/JavaScript):**

```javascript
const fs = require('fs');
const axios = require('axios');

const identityId = process.env.INFISICAL_IDENTITY_ID;
const infisicalAddr = process.env.INFISICAL_ADDR;
const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';

async function getAccessToken() {
  const jwt = fs.readFileSync(tokenPath, 'utf8');

  const response = await axios.post(
    `${infisicalAddr}/api/v1/auth/kubernetes-auth/login`,
    {
      identityId,
      jwt
    }
  );

  return response.data.accessToken;
}

async function getSecret(secretName) {
  const accessToken = await getAccessToken();

  const response = await axios.get(
    `${infisicalAddr}/api/v1/secrets/${secretName}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return response.data;
}

// Usage
getSecret('MY_SECRET').then(secret => console.log(secret));
```

**Example (Python):**

```python
import os
import requests
import json

identity_id = os.getenv('INFISICAL_IDENTITY_ID')
infisical_addr = os.getenv('INFISICAL_ADDR')
token_path = '/var/run/secrets/kubernetes.io/serviceaccount/token'

def get_access_token():
    with open(token_path, 'r') as f:
        jwt = f.read()

    response = requests.post(
        f'{infisical_addr}/api/v1/auth/kubernetes-auth/login',
        json={
            'identityId': identity_id,
            'jwt': jwt
        }
    )
    response.raise_for_status()
    return response.json()['accessToken']

def get_secret(secret_name):
    access_token = get_access_token()

    response = requests.get(
        f'{infisical_addr}/api/v1/secrets/{secret_name}',
        headers={
            'Authorization': f'Bearer {access_token}'
        }
    )
    response.raise_for_status()
    return response.json()

# Usage
secret = get_secret('MY_SECRET')
print(json.dumps(secret, indent=2))
```

**Example using the official Infisical SDK (Python):**

```python
from infisical import client
from infisical.models.common.identity_auth import MachineIdentityType

client.init(
    api_host="https://infisical.example.com",
    site_url="https://infisical.example.com",
)

# Use Kubernetes Auth via environment variables
access_token = client.auth.login(
    identity_type=MachineIdentityType.KUBERNETES,
)

secret = client.secrets.get(
    secret_name="MY_SECRET",
    project_slug="my-project",
    path="/",
)
print(secret.secret_value)
```

---

## Configuration Options Explained

| Option | Description | Example |
|--------|-------------|---------|
| **Kubernetes Host URL** | The Kubernetes API server endpoint | `https://kubernetes.default.svc` |
| **CA Certificate** | PEM-encoded CA cert of your K8s cluster | (see Step 3) |
| **Token Reviewer JWT** | Service account token with TokenReview permission | (see Step 1) |
| **Allowed Namespaces** | Restrict which namespaces can authenticate (comma-separated) | `default,prod,staging` |
| **Allowed Service Account Names** | Restrict which service accounts can authenticate | `my-app` or `*` for any |
| **Allowed Audiences** (optional) | Additional claim validation | Leave blank or set to hostname |

---

## Troubleshooting

### "TokenReview returned false"
- **Cause**: Service account credentials are invalid or expired
- **Fix**: Regenerate the token reviewer token from Step 1:
  ```bash
  kubectl create token infisical-token-reviewer --duration=87600h
  ```

### "Namespace not allowed"
- **Cause**: The pod's namespace isn't in the "Allowed Namespaces" list
- **Fix**: Update the Kubernetes Auth config to include the pod's namespace

### "Service account name not allowed"
- **Cause**: The pod's service account name doesn't match the config
- **Fix**: Either update the pod's serviceAccountName or widen "Allowed Service Account Names" to `*`

### "Connection refused" or "Timeout"
- **Cause**: Pod can't reach Infisical
- **Fix**: Check network policies, firewall rules, and DNS from the pod:
  ```bash
  kubectl exec -it <pod-name> -- curl -v https://infisical.example.com
  ```

### "Invalid JWT" or "JWT verification failed"
- **Cause**: Kubernetes API server can't verify the pod's JWT
- **Fix**: Ensure the CA certificate in Step 3 matches your cluster's actual CA

---

## Identity Design Best Practices

1. **One identity per app/namespace** — Use separate identities for different applications to limit blast radius
2. **Scope by role** — Assign the minimum role needed (e.g., Viewer if the app only reads secrets)
3. **Plan for rotation** — Keep the token reviewer token fresh and consider rotation procedures
4. **Monitor access** — Check Infisical audit logs to see which identities accessed which secrets

---

## Alternative Auth Methods (When NOT to use Kubernetes Auth)

- **Universal Auth**: If your cluster doesn't support TokenReview or if you want a shared secret across multiple services
- **Token Auth**: If you need something quick for testing (not recommended for production)
- **AWS Auth (if on EKS)**: If you want to use AWS IAM roles instead of Kubernetes service accounts
- **OIDC Auth**: If you have an external OIDC provider (e.g., GitHub Actions)

---

## Relevant Code Paths

- **Backend Kubernetes Auth service**: `/sessions/laughing-kind-euler/mnt/infisical/backend/src/services/identity-kubernetes-auth/`
- **API docs**: Check `/docs/documentation/platform/identities/` in the Infisical repo for the latest API reference

---

## Next Steps

1. ✅ Create the token reviewer service account (Step 1)
2. ✅ Create the machine identity in Infisical (Step 2)
3. ✅ Configure Kubernetes Auth (Step 3)
4. ✅ Grant project access if needed (Step 4)
5. ✅ Update your deployment to use the correct service account (Step 5)
6. ✅ Integrate Infisical SDK or REST calls in your app (Step 6)
7. ✅ Deploy and test

If you hit any issues, check the troubleshooting section or inspect Infisical's audit logs and pod logs.
