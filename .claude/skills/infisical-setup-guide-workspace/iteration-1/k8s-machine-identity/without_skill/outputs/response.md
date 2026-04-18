# Setting Up Machine Identity for Kubernetes Pods in Infisical

## Overview

To allow your Kubernetes pods to pull secrets from Infisical, you need to set up a **machine identity** with the appropriate authentication method. Infisical provides several auth methods suited for Kubernetes environments, with **Kubernetes Auth** being the recommended native approach.

## Recommended Authentication Methods for Kubernetes

### 1. Kubernetes Auth (Recommended)

**Kubernetes Auth** is the native, most secure authentication method for Kubernetes workloads. It leverages Kubernetes' built-in service account JWT tokens for authentication.

**Key Benefits:**
- No long-lived credentials to manage
- Leverages Kubernetes' native RBAC
- Automatically rotates access tokens
- Works seamlessly with Kubernetes service accounts
- Supports multiple configuration approaches (reviewer JWT, client self-validation, or gateway-based)

**How it Works:**
1. Your pod's service account JWT is automatically mounted at `/var/run/secrets/kubernetes.io/serviceaccount/token`
2. The pod sends this JWT to Infisical's `/api/v1/auth/kubernetes-auth/login` endpoint
3. Infisical verifies the JWT with the Kubernetes API Server's TokenReview API
4. Infisical returns a short-lived access token (default TTL: 7200 seconds)
5. The pod uses this access token for all subsequent API calls

### 2. Universal Auth (Platform-Agnostic Alternative)

If you prefer not to use Kubernetes Auth, **Universal Auth** provides a simple Client ID and Client Secret approach that works on any platform.

**Pros:**
- Simple to set up
- Platform-agnostic
- Works across multiple environments

**Cons:**
- Requires managing and securing Client Secret credentials
- Not as tightly integrated with Kubernetes

### 3. Other Auth Methods

For specific cloud environments:
- **AWS Auth** - For pods running on EKS
- **GCP Auth** - For pods running on GKE
- **Azure Auth** - For pods running on AKS
- **Token Auth** - Simplest method; direct token authentication (like an API key)

---

## Step-by-Step Setup Guide

### Phase 1: Configure Token Reviewer for Infisical

You have three options for enabling Infisical to validate your service account tokens:

#### Option 1: Dedicated Reviewer JWT Token (Recommended for Most Cases)

This approach uses a dedicated service account with minimal permissions.

**1.1 Create a service account for Infisical:**
```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: infisical-auth
  namespace: default
```

Apply it:
```bash
kubectl apply -f infisical-service-account.yaml
```

**1.2 Bind the service account to the `system:auth-delegator` role:**

This allows Infisical to access the Kubernetes TokenReview API.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: role-tokenreview-binding
  namespace: default
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: infisical-auth
    namespace: default
```

Apply it:
```bash
kubectl apply -f cluster-role-binding.yaml
```

**1.3 Create a long-lived JWT token for the service account:**

```yaml
apiVersion: v1
kind: Secret
type: kubernetes.io/service-account-token
metadata:
  name: infisical-auth-token
  annotations:
    kubernetes.io/service-account.name: "infisical-auth"
```

Apply it:
```bash
kubectl apply -f service-account-token.yaml
```

**1.4 Link the secret to the service account:**

```bash
kubectl patch serviceaccount infisical-auth -p '{"secrets": [{"name": "infisical-auth-token"}]}' -n default
```

**1.5 Retrieve the token reviewer JWT:**

```bash
kubectl get secret infisical-auth-token -n default -o=jsonpath='{.data.token}' | base64 --decode
```

Save this token - you'll need it in Phase 2.

#### Option 2: Client JWT as Reviewer (Eliminate Long-Lived Tokens)

Skip Option 1 and instead grant each application service account the `system:auth-delegator` role:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: infisical-client-binding-[your-app-name]
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: [your-app-service-account]
    namespace: [your-app-namespace]
```

When configuring Kubernetes Auth in Infisical, leave the "Token Reviewer JWT" field empty - Infisical will use the client's own token for validation.

#### Option 3: Gateway as Reviewer (Enterprise Feature)

If you have Infisical Gateway deployed in your cluster, you can use it as the token reviewer. Grant the gateway service account the `system:auth-delegator` role instead of creating a separate reviewer account.

---

### Phase 2: Create a Machine Identity in Infisical

**2.1 Navigate to Identity Management:**
- Go to **Organization Settings > Access Control > Identities**
- Click **Create identity**

**2.2 Create the Identity:**
- **Name:** e.g., `k8s-app-identity`
- **Role:** Select an appropriate organization-level role (determines org-wide permissions)

**2.3 Configure Kubernetes Auth:**

Once the identity is created, edit the **Authentication** section:
- Remove the default Universal Auth configuration
- Add a new **Kubernetes Auth** configuration

**Configuration fields:**

| Field | Description |
|-------|-------------|
| **Kubernetes Host / API URL** | The Kubernetes API server URL. Get it via: `kubectl cluster-info` (usually `https://[cluster-host]:[port]`) |
| **Token Reviewer JWT** | The JWT token from Phase 1 Step 1.5 (leave empty if using Option 2) |
| **Allowed Service Account Names** | Comma-separated list of service accounts allowed to authenticate (e.g., `my-app,my-worker`) |
| **Allowed Namespaces** | Comma-separated list of allowed namespaces (e.g., `default,production`) |
| **Allowed Audience** (optional) | Optional JWT audience claim the token must have |
| **CA Certificate** | PEM-encoded CA cert for the Kubernetes API server (optional for self-signed certs) |
| **Access Token TTL** | How long access tokens last (default: 2592000 = 30 days). Recommended: shorter for production |
| **Access Token Max TTL** | Maximum lifetime an access token can be renewed to (default: 2592000 = 30 days) |
| **Access Token Max Uses** | Maximum times a token can be used (0 = unlimited) |
| **Access Token Trusted IPs** | IP ranges where tokens can be used (default: 0.0.0.0/0 = any) |

**2.4 Add the Identity to Your Project:**

- Go to **Project Settings > Access Control > Machine Identities**
- Click **Add identity**
- Select the identity you just created
- Assign a project-level role (determines what secrets this identity can access)

---

### Phase 3: Deploy Your Application with Kubernetes Auth

**3.1 Ensure Your Pod Uses the Correct Service Account:**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: my-app
  namespace: default
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      serviceAccountName: my-app  # Must match "Allowed Service Account Names"
      containers:
      - name: app
        image: my-app:latest
        # Infisical SDK or Agent will handle authentication
```

**Important:** The service account name must match one listed in the Kubernetes Auth configuration's "Allowed Service Account Names".

**3.2 Use an Infisical Client:**

You have several options:

#### Option A: Infisical SDK (Recommended for Apps)

Use the Infisical SDK for your programming language. It automatically handles Kubernetes Auth:

**Node.js Example:**
```javascript
const { InfisicalClient } = require("@infisical/sdk");

const client = new InfisicalClient({
  auth: {
    identityId: "your-identity-id",
    method: "kubernetes"  // Infisical SDK will use /var/run/secrets/kubernetes.io/serviceaccount/token
  }
});

const secret = await client.getSecret({
  path: "/",
  key: "DATABASE_PASSWORD",
  environment: "prod"
});
```

**Python Example:**
```python
from infisical import InfisicalClient

client = InfisicalClient(
    auth={
        "identity_id": "your-identity-id",
        "method": "kubernetes"
    }
)

secret = client.get_secret(
    path="/",
    key="DATABASE_PASSWORD",
    environment="prod"
)
```

#### Option B: Infisical Operator (Recommended for K8s Secrets)

Use the **Infisical Operator** to automatically sync secrets into Kubernetes Secrets:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: infisical-identity
  namespace: default
type: Opaque
stringData:
  identityId: "your-identity-id"
---
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
  namespace: default
spec:
  hostAPI: https://app.infisical.com/api  # or your self-hosted URL
  authentication:
    identityId:
      secretRef:
        name: infisical-identity
        key: identityId
    method: kubernetes
  secretsScope:
    environment: prod
    secretsPath: /
  managedSecretReference:
    secretName: my-app-secrets
    secretNamespace: default
```

The Operator will:
1. Use Kubernetes Auth to authenticate with Infisical
2. Fetch secrets from your specified scope
3. Create/update a Kubernetes Secret with those values
4. Automatically refresh as secrets change

#### Option C: Infisical Agent (For Legacy Apps)

Deploy the Infisical Agent as a sidecar or separate pod to handle secret delivery:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: infisical-agent-config
  namespace: default
data:
  config.yaml: |
    auth:
      method: kubernetes
      identityId: "your-identity-id"
    templates:
      - templatePath: /etc/infisical/secrets.env
        projectId: "your-project-id"
        environmentSlug: prod
        secretsPath: /
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
spec:
  template:
    spec:
      serviceAccountName: my-app
      containers:
      - name: agent
        image: infisical/agent:latest
        volumeMounts:
        - name: config
          mountPath: /etc/infisical
        - name: secrets
          mountPath: /run/secrets/infisical
      - name: app
        image: my-app:latest
        env:
        - name: INFISICAL_TOKEN
          valueFrom:
            fieldRef:
              fieldPath: /run/secrets/infisical/token
      volumes:
      - name: config
        configMap:
          name: infisical-agent-config
      - name: secrets
        emptyDir: {}
```

---

## Best Practices for Kubernetes Machine Identities

### 1. Use Least Privilege

- Create one identity per namespace or logical grouping of services
- Assign the minimum project/organization role needed
- Restrict "Allowed Namespaces" and "Allowed Service Account Names"

### 2. Set Appropriate Token TTLs

- **Development:** 30 days (default) is acceptable
- **Production:** Use shorter TTLs (e.g., 1-7 days) with automatic renewal
- SDKs and Agents handle renewal automatically

### 3. Implement RBAC in Kubernetes

Even though you're using Kubernetes Auth, ensure your service accounts have minimal Kubernetes RBAC:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: my-app-minimal
rules:
- apiGroups: [""]
  resources: ["configmaps"]
  verbs: ["get", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: my-app-binding
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: my-app-minimal
subjects:
- kind: ServiceAccount
  name: my-app
  namespace: default
```

### 4. Monitor and Audit

- Review access logs in Infisical for unusual patterns
- Monitor token usage and renewal rates
- Set up alerts for authentication failures

### 5. Multi-Cloud / Multi-Cluster Setup

A single machine identity can be configured with multiple auth methods:
- **EKS cluster:** Attach AWS Auth
- **GKE cluster:** Attach GCP Auth
- **Self-hosted K8s:** Attach Kubernetes Auth

All clusters can then authenticate with the same machine identity, which simplifies management.

---

## Troubleshooting

### Pod Cannot Authenticate

**Symptoms:** Pod fails to retrieve secrets, JWT validation errors

**Check:**
1. Service account name matches "Allowed Service Account Names"
2. Pod namespace matches "Allowed Namespaces"
3. Token Reviewer JWT is valid and has `system:auth-delegator` role
4. Kubernetes API URL is correct (test with `kubectl cluster-info`)

### Access Token Expires

**Symptoms:** Requests fail after some time with "token expired"

**Solution:** SDKs and Agents handle renewal automatically. If using raw API calls, implement token renewal:
```javascript
// Get new token before current one expires
const response = await fetch("https://infisical.com/api/v1/auth/kubernetes-auth/login", {
  method: "POST",
  body: JSON.stringify({
    identityId: "...",
    jwt: fs.readFileSync("/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8")
  })
});
```

### "Insufficient Permissions"

**Symptoms:** Authentication succeeds but secret access fails

**Check:**
1. Identity has been added to the project
2. Identity's project-level role grants access to secrets in requested paths/environments
3. Identity's organization-level role is not more restrictive than project role

---

## Summary Table: Choosing Your Auth Method

| Method | Best For | Setup Complexity | Credentials to Manage |
|--------|----------|------------------|----------------------|
| **Kubernetes Auth** | All Kubernetes workloads | Medium | None (uses JWT) |
| **Universal Auth** | Any platform, multi-cloud | Low | Client ID + Secret |
| **Token Auth** | Simple cases, legacy apps | Lowest | Single token |
| **AWS Auth** | EKS specifically | Medium | AWS IAM role |
| **GCP Auth** | GKE specifically | Medium | GCP service account |
| **Azure Auth** | AKS specifically | Medium | Azure managed identity |

For Kubernetes pods, **Kubernetes Auth is the recommended choice** - it provides the best security, automatic token management, and tightest integration with your cluster.

---

## Next Steps

1. Choose your token reviewer approach (dedicated account, client self-validation, or gateway)
2. Create and configure the machine identity in Infisical with Kubernetes Auth
3. Deploy an Infisical client (SDK, Operator, or Agent) to your pods
4. Test authentication and secret retrieval
5. Monitor and audit access patterns
