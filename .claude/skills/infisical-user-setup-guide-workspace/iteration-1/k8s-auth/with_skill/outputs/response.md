# Setting Up Infisical Operator on GKE: Complete Auth & Setup Guide

You're setting up the Infisical Secrets Operator on GKE to sync secrets from Infisical directly into your Kubernetes pods. This guide walks you through authentication setup and getting the operator running.

## Prerequisites

- GKE cluster running Kubernetes 1.29–1.33
- `kubectl` access to your cluster
- Helm 3+ installed
- Infisical organization and project created (either cloud at app.infisical.com or self-hosted)

---

## Step 1: Install the Operator on GKE

Add the Infisical Helm repository and install the operator cluster-wide:

```bash
# Add the Helm repo
helm repo add infisical-helm-charts 'https://dl.cloudsmith.io/public/infisical/helm-charts/helm/charts/'
helm repo update

# Install the operator cluster-wide
helm install --generate-name infisical-helm-charts/secrets-operator
```

If you want to limit the operator to a single namespace (namespace-scoped):

```bash
helm install operator-namespaced infisical-helm-charts/secrets-operator \
  --namespace my-namespace \
  --set scopedNamespaces=my-namespace \
  --set scopedRBAC=true
```

The operator will be installed in the `infisical-operator-system` namespace.

---

## Step 2: Create a Machine Identity in Infisical

The operator needs credentials to authenticate with Infisical. You'll create a machine identity — a non-human workload account similar to an IAM user or service account.

### In the Infisical Dashboard:

1. Go to **Organization Settings > Access Control > Machine Identities**
2. Click **Create Identity**
3. Name it descriptively, e.g., `gke-secrets-operator`
4. Assign an organization-level role with access to the projects/environments your operator needs
5. (Optional) Go to **Project Settings** > **Access Control** to add project-scoped roles

---

## Step 3: Choose an Auth Method for the Operator

For GKE, you have two primary options:

### Option A: Kubernetes Auth (Recommended for GKE)

**Kubernetes Auth is zero-secret** — the operator uses your pod's service account token to authenticate. No credentials to store or rotate.

**Setup in the Infisical Dashboard:**

1. On the machine identity, click **Add Authentication Method** and select **Kubernetes Auth**
2. Configure:
   - **K8s API Host**: The Kubernetes API server URL (e.g., `https://your-gke-cluster-ip`)
   - **CA Certificate**: GKE's CA cert (you can find this in your kubeconfig)
   - **Token Reviewer JWT**: A service account token with `system:auth-delegator` role
   - **Allowed Namespaces**: The namespace(s) where the operator runs (e.g., `infisical-operator-system`)

**Create the token reviewer service account in your cluster:**

```bash
# Create service account for token review
kubectl create serviceaccount infisical-token-reviewer \
  -n infisical-operator-system

# Bind the system:auth-delegator role
kubectl create clusterrolebinding infisical-token-reviewer \
  --clusterrole=system:auth-delegator \
  --serviceaccount=infisical-operator-system:infisical-token-reviewer

# Get the token for the Infisical dashboard
kubectl get secret -n infisical-operator-system \
  $(kubectl get secret -n infisical-operator-system | grep infisical-token-reviewer | awk '{print $1}') \
  -o jsonpath='{.data.token}' | base64 -d
```

### Option B: Universal Auth

If Kubernetes Auth is too complex or you prefer explicit credentials:

1. On the machine identity, add **Universal Auth** (the default)
2. Click **Create Client Secret** and configure:
   - **Access Token TTL**: How long the short-lived token lasts (default: 1 hour)
   - **Max Number of Uses**: Optional limit on secret uses
3. Copy the **Client ID** and **Client Secret**

You'll store these securely in a Kubernetes secret in the next step.

---

## Step 4: Create Auth Credentials in Your Cluster

### For Kubernetes Auth:

If you chose Kubernetes Auth, the operator authenticates via the pod's service account — no secrets needed. Skip to Step 5.

### For Universal Auth:

Create a Kubernetes Secret to store your credentials:

```bash
kubectl create secret generic universal-auth-credentials \
  --namespace infisical-operator-system \
  --from-literal=clientId="<your-client-id>" \
  --from-literal=clientSecret="<your-client-secret>"
```

**Security note**: In production, use a secret management system (Google Secret Manager, HashiCorp Vault, sealed-secrets, etc.) instead of plain kubectl.

---

## Step 5: Create Your First InfisicalSecret

The `InfisicalSecret` custom resource tells the operator which secrets to sync from Infisical into Kubernetes.

### Using Universal Auth:

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
  namespace: default  # Change to your app's namespace
spec:
  hostAPI: https://app.infisical.com/api  # Or your self-hosted URL

  syncConfig:
    resyncInterval: 60s        # How often to check for updates
    instantUpdates: false      # Set to true for webhook-driven updates

  authentication:
    universalAuth:
      secretsScope:
        projectSlug: my-project  # Your project slug
        envSlug: prod            # Your environment (prod, dev, etc.)
        secretsPath: "/"         # Secrets path in Infisical
      credentialsRef:
        secretName: universal-auth-credentials
        secretNamespace: infisical-operator-system

  managedKubeSecretReferences:
    - secretName: my-app-managed-secret
      secretNamespace: default
      creationPolicy: "Orphan"
```

### Using Kubernetes Auth:

```yaml
apiVersion: secrets.infisical.com/v1alpha1
kind: InfisicalSecret
metadata:
  name: my-app-secrets
  namespace: default
spec:
  hostAPI: https://app.infisical.com/api

  syncConfig:
    resyncInterval: 60s
    instantUpdates: false

  authentication:
    kubernetesAuth:
      identityId: <identity-id>  # From Infisical dashboard
      secretsScope:
        projectSlug: my-project
        envSlug: prod
        secretsPath: "/"
      serviceAccountRef:
        name: default            # Or your workload's service account
        namespace: default
      autoCreateServiceAccountToken: true

  managedKubeSecretReferences:
    - secretName: my-app-managed-secret
      secretNamespace: default
      creationPolicy: "Orphan"
```

Apply the resource:

```bash
kubectl apply -f infisical-secret.yaml
```

---

## Step 6: Use Secrets in Your Pods

Once the `InfisicalSecret` is created, the operator syncs the secrets into `my-app-managed-secret` (or whatever name you chose). Now reference it in your deployment:

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
        envFrom:
          - secretRef:
              name: my-app-managed-secret  # References the synced secret
```

All secrets from Infisical are now available as environment variables in your pod.

---

## Step 7: Verify It's Working

Check the status of your `InfisicalSecret`:

```bash
kubectl get infisicalsecret my-app-secrets -o yaml
```

Look at `status.conditions` for success or error details. Common issues:

- **Wrong project slug or environment**: Check in the Infisical dashboard
- **Machine identity has no permission**: Verify the identity has a role with access to the project/environment
- **Credentials secret not found**: Ensure the secret exists in the correct namespace
- **Kubernetes Auth token expired**: Recreate the token reviewer secret

Check the operator logs:

```bash
kubectl logs -n infisical-operator-system \
  -l app.kubernetes.io/name=secrets-operator -f
```

Verify the secret was created:

```bash
kubectl get secret my-app-managed-secret -o yaml
```

---

## Configuration Tips

### Resync Interval

- **Default**: 1 minute (if `instantUpdates: false`)
- **Minimum**: 5 seconds
- **Format**: `[number][unit]` — `s`, `m`, `h`, `d`, `w`

Example: `resyncInterval: 5m` checks every 5 minutes.

### Self-Hosted Infisical

If you're running a self-hosted Infisical instance in the cluster:

```yaml
spec:
  hostAPI: http://infisical-backend.infisical.svc.cluster.local:4000/api
```

For custom or self-signed CA certificates:

```yaml
spec:
  hostAPI: https://your-instance.com/api
  tls:
    caRef:
      secretName: custom-ca-certificate
      secretNamespace: default
      key: ca.crt
```

### Templating Secrets

You can transform secrets using Go templates:

```yaml
managedKubeSecretReferences:
  - secretName: my-tls-secret
    template:
      data:
        tls.crt: "{{ .secrets.TLS_CERT | b64dec }}"
        tls.key: "{{ .secrets.TLS_KEY | b64dec }}"
```

---

## Next Steps

- **Monitoring**: Enable Prometheus metrics by setting `telemetry.serviceMonitor.enabled: true` in Helm values
- **Multiple environments**: Create separate `InfisicalSecret` resources for dev, staging, and prod
- **Dynamic secrets**: Use `InfisicalDynamicSecret` for short-lived database or service credentials
- **Pushing secrets**: Use `InfisicalPushSecret` to push Kubernetes secrets back to Infisical

---

## Summary

1. **Install** the operator via Helm
2. **Create** a machine identity in Infisical
3. **Choose auth**: Kubernetes Auth (recommended, zero-secret) or Universal Auth (explicit credentials)
4. **Store credentials** in a Kubernetes secret (if using Universal Auth)
5. **Create** an `InfisicalSecret` resource with your project/environment details
6. **Reference** the synced secret in your deployments
7. **Monitor** via `kubectl` logs and status checks

Your pods now have secure access to Infisical secrets without embedding credentials in container images.
