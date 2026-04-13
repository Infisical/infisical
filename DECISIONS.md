# Architecture Decisions

## PAM-168: Kubernetes Gateway-Mediated Authentication

### Gateway auto-discovers K8s API URL from environment variables

When using gateway-kubernetes-auth, the gateway ignores the resource's stored URL and reads `KUBERNETES_SERVICE_HOST` / `KUBERNETES_SERVICE_PORT_HTTPS` from its pod environment to discover the K8s API server address.

**Why**: The gateway is running inside the cluster, so the environment variables always point to the correct in-cluster API server. This guarantees correct routing even if the admin enters a different URL on the resource form.

**Alternative considered**: Use the resource's stored URL as-is. Rejected because the admin might enter an external URL or a wrong hostname, while the gateway can always discover the correct local API endpoint.

### Resource form left unchanged (URL still required)

The resource URL field remains required even for accounts using gateway auth. Admins should enter `https://kubernetes.default.svc.cluster.local` for in-cluster gateways.

**Why**: The backend uses the resource URL to extract host/port for relay tunnel routing (`getPAMConnectionDetails`). Making URL optional would require changes to the resource creation flow, schema validation, and the backend host/port extraction logic — a larger scope change.

**Future improvement**: Make URL optional when the resource only has gateway-auth accounts, auto-filling with the in-cluster default.

### TLS: pod CA cert for gateway-auth, resource SSL settings for token auth

For gateway-kubernetes-auth mode, both the validation path (gateway HTTP proxy) and the session path (PAM proxy) use the pod's in-cluster CA cert (`/var/run/secrets/kubernetes.io/serviceaccount/ca.crt`) with strict TLS verification. The resource's `sslRejectUnauthorized` and `sslCertificate` settings are ignored.

**Why**: The gateway talks to its own local K8s API server when using gateway auth. The in-cluster CA cert is the correct trust anchor. The resource SSL settings are for the admin-provided external URL used in token auth mode, where the admin manually configures how to reach the K8s API.
