# Setting Up Infisical Operator on GKE for Secret Synchronization

## Overview

The Infisical Kubernetes operator automates secret synchronization from Infisical to your GKE cluster. This guide covers authentication setup and operator installation.

---

## Prerequisites

- A GKE cluster (1.20+)
- `kubectl` configured to access your cluster
- Helm 3+ (for operator installation)
- Access to an Infisical instance (self-hosted or cloud)
- An Infisical project with secrets already configured
- Service account or user credentials for Infisical API access

---

## Step 1: Create Infisical API Credentials

### Option A: Using a Service Token (Recommended)

1. In Infisical, navigate to your project
2. Go to **Settings → Service Tokens**
3. Create a new service token with appropriate permissions:
   - Select the scope (project-level recommended)
   - Grant read access to secrets
   - Copy the generated token (you'll need this shortly)

### Option B: Using API Keys

1. Navigate to **Settings → API Keys** in your organization
2. Create a new API key with read permissions
3. Note both the API key ID and secret

### Option C: Using Kubernetes Authentication (Advanced)

If you prefer OIDC-based authentication:
1. Configure your GKE cluster to use Workload Identity
2. Bind a GKE service account to an Infisical identity
3. This approach requires Infisical to support OIDC (check your instance version)

---

## Step 2: Install the Infisical Operator

### Add the Infisical Helm Repository

```bash
helm repo add infisical https://infisical.com/helm-charts
helm repo update
```

### Create a Namespace for the Operator

```bash
kubectl create namespace infisical-operator
```

### Install the Operator

```bash
helm install infisical-operator infisical/infisical-operator \
  --namespace infisical-operator \
  --version <latest-version>
```

To verify the installation:

```bash
kubectl get pods -n infisical-operator
kubectl get crd | grep infisical
```

You should see the operator pod running and Infisical CRDs registered.

---

## Step 3: Create a Secret for Authentication

Store your Infisical credentials as a Kubernetes secret:

```bash
kubectl create secret generic infisical-auth \
  --from-literal=token=<YOUR_SERVICE_TOKEN> \
  -n <your-namespace>
```

Or if using API keys:

```bash
kubectl create secret generic infisical-auth \
  --from-literal=apiKeyId=<YOUR_API_KEY_ID> \
  --from-literal=apiKeySec=<YOUR_API_KEY_SECRET> \
  -n <your-namespace>
```

---

## Step 4: Create an InfisicalSecret Resource

Create a custom resource to sync secrets from Infisical to your pods:

```yaml
apiVersion: infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
  namespace: default
spec:
  # Reference to your Infisical instance
  infisicalAPIUrl: https://app.infisical.com  # or your self-hosted URL

  # Reference to the auth secret created in Step 3
  authRef:
    name: infisical-auth
    key: token  # adjust if using different secret key

  # Infisical project details
  projectId: <YOUR_PROJECT_ID>

  # Optional: environment filter
  environment: prod  # dev, staging, prod, etc.

  # Optional: secret path filter
  secretsPath: /  # root or specific path like /database

  # Where to create the Kubernetes secret
  secretName: my-app-secrets-k8s
  secretNamespace: default

  # How often to resync (optional)
  resyncInterval: 1h
```

Apply the resource:

```bash
kubectl apply -f infisical-secret.yaml
```

---

## Step 5: Verify Secret Synchronization

Check that the secret was created:

```bash
kubectl get secret my-app-secrets-k8s -n default -o yaml
```

You should see the synced secrets as key-value pairs in the `data` section.

### Verify Secret Content (Decoding)

```bash
kubectl get secret my-app-secrets-k8s -n default \
  -o jsonpath='{.data.YOUR_SECRET_KEY}' | base64 -d
```

---

## Step 6: Mount Secrets in Your Pod

Reference the synchronized secret in your pod spec:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
  namespace: default
spec:
  containers:
  - name: my-app
    image: my-app:latest
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: my-app-secrets-k8s
          key: db_password
    volumeMounts:
    - name: secrets
      mountPath: /etc/secrets
  volumes:
  - name: secrets
    secret:
      secretName: my-app-secrets-k8s
```

Or use it in a Deployment:

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
      serviceAccountName: my-app-sa
      containers:
      - name: my-app
        image: my-app:latest
        envFrom:
        - secretRef:
            name: my-app-secrets-k8s
```

---

## Authentication Options Explained

### Service Tokens
- **Best for**: Simple deployments, project-specific access
- **Pros**: Scoped to a single project, easy to rotate
- **Cons**: Requires storing in Kubernetes secret

### API Keys
- **Best for**: Organization-level access or multiple projects
- **Pros**: Broader access, useful for admin tasks
- **Cons**: More powerful; requires careful permission management

### Workload Identity (OIDC)
- **Best for**: Security-hardened environments, no secrets in K8s
- **Pros**: No static credentials stored in cluster
- **Cons**: Requires OIDC support and more complex setup

---

## Troubleshooting

### Operator Pod Not Starting

```bash
kubectl logs -n infisical-operator deployment/infisical-operator
```

Check for:
- Image pull errors
- Resource constraints
- RBAC issues

### InfisicalSecret Not Syncing

```bash
kubectl describe infisicalsecret my-app-secrets -n default
```

Check for:
- Invalid credentials in the auth secret
- Incorrect project ID or environment name
- Network connectivity to Infisical instance
- Operator permissions

### Permission Denied Errors

Verify your service token or API key has:
- Read access to the project
- Access to the specified environment
- No IP whitelist restrictions blocking the operator pod

### Secret Not Updated After Infisical Changes

Check the resyncInterval setting. Force a resync:

```bash
kubectl rollout restart deployment/infisical-operator -n infisical-operator
```

---

## Security Best Practices

1. **Use Service Tokens over API Keys** — scoped access is safer
2. **Rotate Credentials Regularly** — update the auth secret periodically
3. **Enable Network Policies** — restrict operator pod egress
4. **Use RBAC** — limit who can view InfisicalSecret resources
5. **Encrypt ETCD** — enable encryption at rest in GKE
6. **Use Workload Identity** — eliminate static secrets if possible
7. **Audit Logging** — enable in GKE to track secret access

---

## GKE-Specific Considerations

### Workload Identity Setup

If using Workload Identity:

```bash
# Enable Workload Identity on your cluster
gcloud iam service-accounts create infisical-operator

# Bind Kubernetes SA to GCP SA
gcloud iam service-accounts add-iam-policy-binding \
  infisical-operator@PROJECT_ID.iam.gserviceaccount.com \
  --role roles/iam.workloadIdentityUser \
  --member "serviceAccount:PROJECT_ID.svc.id.goog[infisical-operator/infisical-operator]"

# Annotate the Kubernetes service account
kubectl annotate serviceaccount infisical-operator \
  -n infisical-operator \
  iam.gke.io/gcp-service-account=infisical-operator@PROJECT_ID.iam.gserviceaccount.com
```

Then configure Infisical to trust this identity (if supported).

### Network Policy Recommendations

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: infisical-operator-egress
  namespace: infisical-operator
spec:
  podSelector:
    matchLabels:
      app: infisical-operator
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # HTTPS to Infisical
  - to:
    - namespaceSelector:
        matchLabels:
          name: kube-system
    ports:
    - protocol: TCP
      port: 53  # DNS
    - protocol: UDP
      port: 53
```

---

## Next Steps

1. **Test in a non-production environment first**
2. **Set up monitoring** for secret sync failures
3. **Implement automatic credential rotation** using Infisical APIs
4. **Document your secret naming conventions** for your team
5. **Plan migration** of existing Kubernetes secrets to Infisical management

---

## Additional Resources

- Infisical Kubernetes Operator Documentation
- GKE Security Best Practices
- Kubernetes Secrets Management Guide
- Workload Identity for GKE
