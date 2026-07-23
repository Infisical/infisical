# Kubernetes Machine Identity Setup for Infisical

## Overview

This guide covers setting up machine identity authentication for Kubernetes pods to securely pull secrets from Infisical. The recommended approach uses **Kubernetes Auth** (also called OIDC auth or JWT auth), which leverages Kubernetes Service Accounts to authenticate pods without storing long-lived credentials in the cluster.

## Architecture

The authentication flow:
1. Pod runs with a Kubernetes Service Account
2. Pod requests a JWT token from the Kubernetes API server
3. Pod sends JWT token to Infisical's machine identity endpoint
4. Infisical verifies the JWT signature using the Kubernetes cluster's public key
5. Infisical returns authentication credentials (API key or OIDC token)
6. Pod uses credentials to fetch secrets

## Authentication Methods for Kubernetes

### Recommended: Kubernetes (OIDC/JWT) Auth

This is the **preferred method** for Kubernetes deployments because:
- No long-lived credentials stored in the cluster
- Automatic credential rotation via Kubernetes JWT tokens
- Fine-grained RBAC using Kubernetes Service Accounts and Namespaces
- Works across cluster restarts without configuration changes

### Alternative: API Key Auth

Suitable for:
- Development/testing environments
- Static workloads that don't require frequent rotation
- Quick prototyping

Note: Less secure for production as it requires storing credentials as Secrets in the cluster.

---

## Setup Guide: Kubernetes (OIDC/JWT) Auth

### Prerequisites

1. **Infisical Instance**: Running Infisical (cloud or self-hosted)
2. **Kubernetes Cluster**: Access to kubectl
3. **OIDC Provider Setup** (for self-hosted Infisical):
   - Your Kubernetes cluster's public key and OIDC issuer URL
   - Typically: `https://<your-k8s-api-server>/`

For **Infisical Cloud**, skip the OIDC setup—it's pre-configured.

### Step 1: Create a Machine Identity in Infisical

1. Log in to Infisical
2. Navigate to **Settings → Machine Identities**
3. Click **Create Machine Identity**
4. Fill in:
   - **Name**: e.g., `k8s-prod-pod`
   - **Type**: Select **Kubernetes** (or **OIDC** if Kubernetes option isn't available)
   - **Description**: Optional, e.g., "Production pod authentication"
5. Click **Create**

### Step 2: Configure Kubernetes Auth Method

After creating the machine identity:

1. Click on the machine identity to view its details
2. Navigate to the **Auth Methods** or **Access Control** tab
3. Click **Add Auth Method** → **Kubernetes**
4. Configure the following:

   - **OIDC Discovery URL**: The Kubernetes OIDC issuer URL
     - For Infisical Cloud: `https://oidc.infisical.com`
     - For self-hosted: `https://<your-k8s-api-server>/`

   - **Audience (optional)**: Usually set to the Infisical instance URL or left blank

   - **Allowed Namespaces**: Specify which Kubernetes namespaces can authenticate
     - Format: `namespace` or `*` for all namespaces
     - Example: `default`, `production`, or `*`

   - **Allowed Service Accounts**: Specify which Service Accounts can authenticate
     - Format: `serviceaccount-name` or `*` for all
     - Example: `app-sa`, `*`

   - **Allowed Pods** (optional, for stricter control):
     - Pod name patterns or specific pod names

5. Click **Save**

### Step 3: Create a Kubernetes Service Account

Create a Service Account for your pod (in your deployment):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: infisical-app-sa
  namespace: default  # or your namespace
```

Apply:
```bash
kubectl apply -f serviceaccount.yaml
```

### Step 4: Create the Deployment with Token Projection

Modify your Deployment to project the Kubernetes JWT token into the pod:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: default
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-app
  template:
    metadata:
      labels:
        app: my-app
    spec:
      serviceAccountName: infisical-app-sa
      containers:
      - name: app
        image: my-app:latest
        env:
        - name: INFISICAL_MACHINE_IDENTITY_ID
          value: "<MACHINE_IDENTITY_ID>"  # From Infisical dashboard
        - name: INFISICAL_MACHINE_IDENTITY_ISSUER_URL
          value: "https://<your-infisical-instance>"
        volumeMounts:
        - name: ksa-token
          mountPath: /var/run/secrets/kubernetes.io/serviceaccount
          readOnly: true
      volumes:
      - name: ksa-token
        projected:
          sources:
          - serviceAccountToken:
              audience: https://<your-infisical-instance>
              expirationSeconds: 3600
              path: token
```

**Key Details**:
- `serviceAccountName`: Must match the Service Account created in Step 3
- `INFISICAL_MACHINE_IDENTITY_ID`: Get this from the machine identity dashboard
- `INFISICAL_MACHINE_IDENTITY_ISSUER_URL`: Your Infisical instance URL
- `audience`: Should match your Infisical instance URL
- `expirationSeconds`: Token lifetime (3600 = 1 hour, recommended)

### Step 5: Retrieve Secrets in Your Application

Once authenticated, retrieve secrets using the Infisical SDK:

#### Node.js Example

```javascript
const { InfisicalSDK } = require("@infisical/sdk");

async function getSecrets() {
  const client = new InfisicalSDK({
    clientId: process.env.INFISICAL_MACHINE_IDENTITY_ID,
    clientSecret: process.env.INFISICAL_MACHINE_IDENTITY_SECRET,
    // OR use JWT token from file:
    auth: {
      authMethod: "kubernetes",
      machineIdentityId: process.env.INFISICAL_MACHINE_IDENTITY_ID,
      kubernetesTokenPath: "/var/run/secrets/kubernetes.io/serviceaccount/token"
    }
  });

  const secret = await client.getSecret({
    projectId: "your-project-id",
    secretName: "DATABASE_PASSWORD",
    environment: "prod"
  });

  console.log(secret.secretValue);
}

getSecrets();
```

#### Python Example

```python
from infisical_client import InfisicalClient
import os

client = InfisicalClient(
    machine_identity_id=os.getenv("INFISICAL_MACHINE_IDENTITY_ID"),
    machine_identity_issuer_url=os.getenv("INFISICAL_MACHINE_IDENTITY_ISSUER_URL"),
)

secret = client.get_secret(
    project_id="your-project-id",
    secret_name="DATABASE_PASSWORD",
    environment="prod"
)

print(secret.secret_value)
```

---

## Setup Guide: API Key Auth (Alternative)

If using API Key auth (less recommended for production):

### Step 1: Generate an API Key

1. In Infisical, go to **Settings → Machine Identities**
2. Create a machine identity (same as above)
3. Go to **Auth Methods** → **Add Auth Method** → **API Key**
4. Infisical will generate an API key—copy it immediately (it won't be shown again)

### Step 2: Store API Key as Kubernetes Secret

```bash
kubectl create secret generic infisical-api-key \
  --from-literal=api-key=<YOUR_API_KEY> \
  -n default
```

Or use a manifest:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: infisical-api-key
  namespace: default
type: Opaque
stringData:
  api-key: <YOUR_API_KEY>
```

### Step 3: Reference in Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: my-app:latest
        env:
        - name: INFISICAL_API_KEY
          valueFrom:
            secretKeyRef:
              name: infisical-api-key
              key: api-key
        - name: INFISICAL_ADDRESS
          value: "https://<your-infisical-instance>"
```

### Step 4: Use API Key in Application

```javascript
const { InfisicalSDK } = require("@infisical/sdk");

const client = new InfisicalSDK({
  auth: {
    authMethod: "api_key",
    apiKey: process.env.INFISICAL_API_KEY
  }
});

const secret = await client.getSecret({
  projectId: "your-project-id",
  secretName: "DATABASE_PASSWORD"
});
```

---

## Verification & Troubleshooting

### Test the Authentication

1. **Get the pod's JWT token**:
   ```bash
   kubectl exec -it <pod-name> -- cat /var/run/secrets/kubernetes.io/serviceaccount/token
   ```

2. **Manually test authentication** (from inside or outside the pod):
   ```bash
   curl -X POST https://<your-infisical-instance>/api/v1/auth/oidc \
     -H "Content-Type: application/json" \
     -d '{
       "jwt": "<JWT_TOKEN>",
       "machineIdentityId": "<MACHINE_IDENTITY_ID>"
     }'
   ```

   Expected response: JWT or API key for accessing Infisical

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | Service account not allowed | Check **Allowed Namespaces** and **Allowed Service Accounts** in machine identity config |
| Token not found in pod | Token not projected | Verify `volumes` and `volumeMounts` in Deployment spec |
| OIDC issuer not found | Wrong issuer URL | For self-hosted, use `https://<your-k8s-api-server>/` |
| Audience mismatch | Wrong audience value | Match the pod's audience to Infisical's expected value |
| Pod can't reach Infisical | Network/DNS issue | Test connectivity: `kubectl exec -it <pod> -- curl https://<infisical-url>` |

### Debug Steps

1. **Check Service Account is mounted**:
   ```bash
   kubectl describe sa infisical-app-sa -n default
   ```

2. **Verify token projection**:
   ```bash
   kubectl exec -it <pod-name> -- ls -la /var/run/secrets/kubernetes.io/serviceaccount/
   ```

3. **Check pod logs**:
   ```bash
   kubectl logs <pod-name>
   ```

4. **Verify RBAC** (if RBAC is enabled):
   ```bash
   kubectl auth can-i get secrets --as=system:serviceaccount:default:infisical-app-sa
   ```

---

## Security Best Practices

1. **Use OIDC/Kubernetes Auth in Production**
   - Avoid storing static API keys in clusters
   - Let Kubernetes handle credential rotation

2. **Scope Service Accounts Narrowly**
   - Create separate Service Accounts per workload/team
   - Use Namespace isolation

3. **Restrict Machine Identity Auth Methods**
   - Only enable necessary authentication methods
   - Disallow API Key auth if using OIDC

4. **Network Policies**
   - Restrict egress from pods to Infisical only where needed
   - Use NetworkPolicy to limit cross-namespace communication

5. **Audit Logging**
   - Enable Infisical audit logs to track secret access
   - Monitor failed authentication attempts

6. **Token Expiration**
   - Keep `expirationSeconds` short (3600 or less)
   - Kubernetes automatically rotates tokens

---

## Self-Hosted Infisical: OIDC Setup

If running self-hosted Infisical, configure OIDC discovery:

1. **Expose Kubernetes OIDC endpoint** (usually already exposed at `https://<api-server>/.well-known/openid-configuration`)

2. **In Infisical, set OIDC provider** during setup:
   - Issuer URL: `https://<your-k8s-api-server>/`
   - Audience: Your Infisical instance URL

3. **Ensure your Kubernetes API server is accessible** from Infisical for OIDC verification

4. **Test OIDC discovery**:
   ```bash
   curl https://<your-k8s-api-server>/.well-known/openid-configuration
   ```

---

## Summary

| Aspect | Kubernetes (OIDC) Auth | API Key Auth |
|--------|------------------------|--------------|
| **Security** | High (no static secrets) | Lower (static API key) |
| **Credential Rotation** | Automatic (K8s manages) | Manual |
| **Setup Complexity** | Medium | Low |
| **Production Ready** | Yes | For non-prod only |
| **Scalability** | Excellent | Good |
| **Recommended** | **Yes** | No |

For production Kubernetes deployments, **use Kubernetes (OIDC/JWT) Auth** for maximum security and automatic credential management.
