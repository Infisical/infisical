# PAM-168: Kubernetes Gateway-Mediated Authentication

## Context

Today, adding a Kubernetes PAM account requires the admin to manually extract a long-lived static service account token from the cluster and paste it into Infisical. This token sits encrypted in the DB forever, never rotates, and is a security risk if leaked.

This feature adds a second auth method: **gateway impersonation**. The gateway pod (already running inside the K8s cluster) authenticates as itself using its auto-mounted pod token, then adds `Impersonate-User` headers to K8s API requests to act as the target service account. The admin only inputs a service account name and namespace — no tokens.

Both auth methods coexist on the same K8s resource. No DB migration needed (credentials stored as independent encrypted JSON blobs per account row — new shape doesn't touch old entries). No new permissions — Kubernetes RBAC enforces impersonation access.

---

## Two separate paths to understand

There are two distinct code paths that handle K8s differently, and changes are needed in different places for each:

```
1. VALIDATION PATH (account creation)
   Backend → gateway HTTP proxy (connection.go) → K8s API
   Uses GatewayProxyProtocol.Http + x-infisical-action header
   Gateway intercepts, injects pod token + discovers K8s API
   ✅ Already works — no changes to gateway-v2/connection.go needed
   We just need the backend to send the right headers

2. SESSION PATH (user accessing the cluster)
   Browser → relay → gateway PAM proxy (pam-proxy.go → kubernetes/proxy.go) → K8s API
   Uses GatewayProxyProtocol.Pam
   Gateway runs persistent HTTP proxy loop, injects auth headers per request
   ❌ Needs changes — proxy.go must learn to read pod token + set impersonation headers
```

---

## Changes

### 1. Backend — Enum

**`backend/src/ee/services/pam-resource/kubernetes/kubernetes-resource-enums.ts`**

Add `GatewayKubernetesAuth = "gateway-kubernetes-auth"` to the existing enum.

### 2. Backend — Schemas

**`backend/src/ee/services/pam-resource/kubernetes/kubernetes-resource-schemas.ts`**

- Add `KubernetesGatewayAuthCredentialsSchema`:
  ```
  { authMethod: "gateway-kubernetes-auth", namespace: string, serviceAccountName: string }
  ```
- Add it to `KubernetesAccountCredentialsSchema` discriminated union
- Update `SanitizedKubernetesResourceSchema.rotationAccountCredentials` to include the new variant (namespace + serviceAccountName are not sensitive, so they appear in sanitized view)
- Update `SanitizedKubernetesAccountWithResourceSchema.credentials` similarly (line 83)
- `KubernetesSessionCredentialsSchema` (the `.and()` of connectionDetails + credentials) works as-is since it uses `KubernetesAccountCredentialsSchema` which now includes both variants

### 3. Backend — Factory validation

**`backend/src/ee/services/pam-resource/kubernetes/kubernetes-resource-factory.ts`**

`validateAccountCredentials()`: Add branch for `GatewayKubernetesAuth` that validates via **impersonated SelfSubjectReview**. This reuses the existing gateway HTTP proxy infrastructure in `connection.go:109-143` — no changes needed to gateway-v2 code.

The backend sends the request through `GatewayProxyProtocol.Http` with these headers:
```
POST /apis/authentication.k8s.io/v1/selfsubjectreviews
x-infisical-action: use-k8s-sa                    ← GatewayHttpProxyActions.UseGatewayK8sServiceAccount
Impersonate-User: system:serviceaccount:<ns>:<sa>  ← passes through req.Header.Clone() untouched
Impersonate-Group: system:serviceaccounts
Impersonate-Group: system:serviceaccounts:<ns>
Content-Type: application/json
Body: { apiVersion: "authentication.k8s.io/v1", kind: "SelfSubjectReview" }
```

The gateway's `use-k8s-sa` handler (connection.go:109-143):
1. Reads pod token from `/var/run/secrets/.../token` → sets `Authorization: Bearer <token>`
2. Reads pod CA cert from `/var/run/secrets/.../ca.crt` → configures TLS
3. Auto-discovers K8s API from `KUBERNETES_SERVICE_HOST` env var → overrides target URL
4. Clones all other headers (including our `Impersonate-*` headers) via `proxyReq.Header = req.Header.Clone()`
5. Removes the `x-infisical-action` header before forwarding

**Implementation**: Create a `validateWithGatewayHttp` helper alongside the existing `executeWithGateway` (which uses TCP). This avoids modifying the shared `executeWithGateway` function signature and keeps existing callers untouched. The new helper uses `GatewayProxyProtocol.Http` and `http://localhost` base URL (same pattern as Dynamic Secrets' `$gatewayProxyWrapper` with `reviewTokenThroughGateway: true`, seen at `kubernetes.ts:66-78`).

**Error mapping** — the backend must parse the gateway/K8s response to give useful error messages:

| Gateway/K8s response | User-facing error |
|---|---|
| Gateway returns 500 "failed to read k8s sa auth token" | "Gateway is not running inside a Kubernetes cluster. Gateway auth requires the gateway to be deployed as a pod." |
| K8s returns 403 with "cannot impersonate" in body | "Gateway service account lacks impersonation permissions for this service account. Ensure the gateway's ClusterRole includes `impersonate` verb for this SA." |
| K8s returns 404 or 403 (SA-not-found) | "Service account not found in the specified namespace." |
| Connection timeout / no response | "Unable to reach the Kubernetes API server through the gateway." |

Parse `error.response?.data?.message` (K8s API errors include a `message` field) to distinguish these cases.

`handleOverwritePreventionForCensoredValues()`: Add branch for `GatewayKubernetesAuth` — no sensitive fields to preserve, just return the updated credentials as-is.

### 4. Backend — Session credentials (no changes needed)

**`backend/src/ee/services/pam-account/pam-account-service.ts`**

`getSessionCredentials()` at line 1058 already returns `{ ...connectionDetails, ...credentials }` generically. For gateway auth, this produces:
```
{ url, sslRejectUnauthorized, sslCertificate?, authMethod: "gateway-kubernetes-auth", namespace, serviceAccountName }
```
The gateway parses `authMethod` to decide behavior. No code changes needed.

`accessAccount()` host/port extraction at line 827 still works — the resource always has a `connectionDetails.url`.

### 5. Gateway — API model

**`../cli/packages/api/model.go`** — `PAMSessionCredentials` struct (line 852)

Add two new fields:
```go
ServiceAccountName  string `json:"serviceAccountName,omitempty"`
Namespace           string `json:"namespace,omitempty"`
```

### 6. Gateway — Credential cache struct

**`../cli/packages/pam/session/credentials.go`** — `PAMCredentials` struct (line 13)

Add matching fields and update the mapping at line ~88-103 to copy them from the API response.

### 7. Gateway — Kubernetes proxy config

**`../cli/packages/pam/handlers/kubernetes/proxy.go`** — `KubernetesProxyConfig` struct (line 23)

Add fields for impersonation:
```go
ImpersonateNamespace      string
ImpersonateServiceAccount string
```

### 8. Gateway — Kubernetes proxy handler (the core change)

**`../cli/packages/pam/handlers/kubernetes/proxy.go`**

Extract a helper method for injecting auth headers, called from both `HandleConnection` (line 168) and `forwardWebsocketConnection` (line 259):

```go
func (p *KubernetesProxy) injectAuthHeaders(headers http.Header) error {
    switch p.config.AuthMethod {
    case "service-account-token":
        headers.Set("Authorization", fmt.Sprintf("Bearer %s", p.config.InjectServiceAccountToken))
    case "gateway-kubernetes-auth":
        // Read fresh on each request — K8s auto-rotates projected volume tokens
        token, err := os.ReadFile(util.KUBERNETES_SERVICE_ACCOUNT_TOKEN_PATH)
        if err != nil {
            return fmt.Errorf("gateway not running in K8s cluster: %w", err)
        }
        headers.Set("Authorization", fmt.Sprintf("Bearer %s", strings.TrimSpace(string(token))))
        saUser := fmt.Sprintf("system:serviceaccount:%s:%s",
            p.config.ImpersonateNamespace, p.config.ImpersonateServiceAccount)
        headers.Set("Impersonate-User", saUser)
        headers.Set("Impersonate-Group", "system:serviceaccounts")
        headers.Add("Impersonate-Group",
            fmt.Sprintf("system:serviceaccounts:%s", p.config.ImpersonateNamespace))
    }
    return nil
}
```

Constants for file paths already exist in `../cli/packages/util/constants.go` (lines 65-68).

### 9. Gateway — PAM proxy setup

**`../cli/packages/pam/pam-proxy.go`** — Kubernetes case (line 291)

Branch on `credentials.AuthMethod`:

For `"gateway-kubernetes-auth"`:
- Auto-discover K8s API URL from env vars (`KUBERNETES_SERVICE_HOST` + `KUBERNETES_SERVICE_PORT_HTTPS`) — override `TargetApiServer`. Constants in `util/constants.go`.
- Read CA cert from `/var/run/secrets/kubernetes.io/serviceaccount/ca.crt` — build `tls.Config` with pod CA cert
- **TLS behavior**: For gateway-auth mode, always use the pod's in-cluster CA cert with strict TLS verification (`InsecureSkipVerify: false`). Ignore the resource's `sslRejectUnauthorized` and `sslCertificate` settings — those are for the admin-provided external URL, not the in-cluster API. This is consistent with the validation path where the `use-k8s-sa` handler also uses pod CA cert with strict TLS.
- Pass `ImpersonateNamespace` and `ImpersonateServiceAccount` to `KubernetesProxyConfig`

For `"service-account-token"`: existing behavior unchanged.

### 10. Frontend — Types

**`frontend/src/hooks/api/pam/types/kubernetes-resource.ts`**

- Add `GatewayKubernetesAuth = "gateway-kubernetes-auth"` to `KubernetesAuthMethod` enum
- Add `TKubernetesGatewayAuthCredentials` type: `{ authMethod, namespace, serviceAccountName }`
- Update `TKubernetesCredentials` union to include both types

### 11. Frontend — Account form

**`frontend/src/pages/pam/PamAccountsPage/components/PamAccountForm/KubernetesAccountForm.tsx`**

Follow the **SSH account form** pattern (`SshAccountForm.tsx`) — the only other PAM account form with multiple auth methods.

#### Form mockups

**When "Service Account Token" is selected (current behavior, unchanged):**

```
┌─────────────────────────────────────────────────────────────┐
│  Add Kubernetes Account                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ deploy-bot-access                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Description (optional)                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │                                                      │   │
│  │ Authentication Method                                │   │
│  │ ┌──────────────────────────────────────────────┐     │   │
│  │ │ Service Account Token                    ▾   │     │   │
│  │ └──────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  │ Service Account Token                                │   │
│  │ The bearer token for the service account             │   │
│  │ ┌──────────────────────────────────────────────┐     │   │
│  │ │ eyJhbGciOiJSUzI1NiIsImtpZCI6...             │     │   │
│  │ │                                              │     │   │
│  │ │                                              │     │   │
│  │ │                                              │     │   │
│  │ └──────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                             │
│  ┌──────────────────┐  ┌────────┐                           │
│  │  Create Account  │  │ Cancel │                           │
│  └──────────────────┘  └────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

**When "Gateway" is selected (new):**

```
┌─────────────────────────────────────────────────────────────┐
│  Add Kubernetes Account                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Name                                                       │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ deploy-bot-access                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  Description (optional)                                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│  │                                                      │   │
│  │ Authentication Method                                │   │
│  │ ┌──────────────────────────────────────────────┐     │   │
│  │ │ Gateway                                  ▾   │     │   │
│  │ └──────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  │ Service Account Name                                 │   │
│  │ Name of the K8s service account to impersonate       │   │
│  │ ┌──────────────────────────────────────────────┐     │   │
│  │ │ deploy-bot                                   │     │   │
│  │ └──────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  │ Namespace                                            │   │
│  │ K8s namespace where the service account lives        │   │
│  │ ┌──────────────────────────────────────────────┐     │   │
│  │ │ default                                      │     │   │
│  │ └──────────────────────────────────────────────┘     │   │
│  │                                                      │   │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                             │
│  ┌──────────────────┐  ┌────────┐                           │
│  │  Create Account  │  │ Cancel │                           │
│  └──────────────────┘  └────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

#### Implementation details

- Zod schema: `z.discriminatedUnion("authMethod", [ServiceAccountTokenSchema, GatewayAuthSchema])`
- Auth method `<Select>` dropdown (like SSH lines 71-95): **"Service Account Token" / "Gateway"**
- `useWatch` on `credentials.authMethod` for conditional rendering (like SSH line 59-60)
- `setValue` to clear fields on auth method switch (like SSH lines 86-87)
- When "Service Account Token" selected: show existing token TextArea (current behavior)
- When "Gateway" selected: show two `<Input>` fields — Namespace and Service Account Name. No sensitive data, no `UNCHANGED_PASSWORD_SENTINEL` needed.
- Default values for create: default to `ServiceAccountToken` auth method (existing behavior)
- Default values for update: if gateway auth, just spread credentials as-is (no masking)

### 12. DECISIONS.md

**`DECISIONS.md`** (new file at project root)

Document:
1. **Gateway auto-discovers K8s API URL from env vars** — the gateway ignores the resource's stored URL when in gateway-auth mode and reads `KUBERNETES_SERVICE_HOST`/`KUBERNETES_SERVICE_PORT_HTTPS` from its pod environment. This guarantees correct routing even if the admin enters a wrong URL on the resource.
2. **Resource form left as-is** — the resource URL is still required even for gateway-auth accounts. For now, admins enter `https://kubernetes.default.svc.cluster.local` for in-cluster gateways. A future improvement could make URL optional when all accounts use gateway auth, but this would require changes to resource creation flow, schema validation, and backend host/port extraction. Kept out of scope for this PR.
3. **TLS behavior divergence by design** — validation path (gateway HTTP proxy) and session path (PAM proxy) both use the pod's in-cluster CA cert with strict TLS for gateway-auth mode. Resource SSL settings (`sslRejectUnauthorized`, `sslCertificate`) are ignored for gateway-auth because the gateway talks to its own local K8s API, not the admin-provided external URL.

---

## What does NOT change

- **No DB migration** — credentials are encrypted JSON blobs, each row independent
- **No new permissions** — K8s RBAC enforces impersonation; Infisical project RBAC controls account creation
- **No `pam-account-service.ts` changes** — generic credential return path works as-is
- **No `pam-session-router.ts` changes** — session credentials schema auto-picks up the new variant
- **No `gateway-v2/connection.go` changes** — the existing `use-k8s-sa` handler already supports our validation path. It reads pod token, sets Auth header, reads CA cert, discovers K8s API, and passes through all other headers (including `Impersonate-User`/`Impersonate-Group`) via `req.Header.Clone()`.
- **No `gateway-v2/constants.go` changes** — existing constants are used as-is
- **No resource form changes** — the resource still has a URL, SSL, and gateway

---

## Verification

1. **Backend type-check**: `cd backend && npm run type:check`
2. **Frontend type-check**: `cd frontend && npm run type:check`
3. **Lint**: `make reviewable-api && make reviewable-ui`
4. **Manual E2E test** (requires K8s cluster with gateway deployed):
   - Create K8s PAM resource with URL `https://kubernetes.default.svc.cluster.local` and a gateway
   - Create account with auth method "Gateway", SA name, namespace — should validate successfully
   - Create account with a non-existent SA name — should fail validation with clear error
   - Start a session with valid account → verify `kubectl get pods` works through the browser
   - Verify error case: remove impersonate permission from gateway's ClusterRole → session should fail with 403
