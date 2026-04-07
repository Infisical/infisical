# Machine Identity Authentication

Guide the user through setting up machine-to-machine authentication in Infisical. Machine identities let workloads (pods, CI jobs, Lambda functions, VMs, etc.) authenticate with Infisical to retrieve secrets programmatically.

## Core concept

A **machine identity** is an entity representing a workload that needs access to Infisical — similar to an IAM user in AWS, a service account in GCP, or a service principal in Azure. Each identity:

1. Is created with a name and role (org-level or project-level)
2. Has an **authentication method** configured (how it proves its identity)
3. Authenticates with Infisical API → receives a **short-lived access token**
4. Uses that token to make API requests (fetch secrets, manage resources, etc.)

## Choosing the right auth method

Help the user pick based on where their workload runs:

| Auth Method | Platform | How it works |
|-------------|----------|-------------|
| **Universal Auth** | Any platform | Client ID + Client Secret exchange for access token |
| **Token Auth** | Any platform | Pre-generated bearer token, no exchange needed |
| **Kubernetes Auth** | Kubernetes | Pod service account JWT verified by Infisical |
| **AWS Auth** | AWS (EC2, Lambda, ECS, etc.) | AWS STS GetCallerIdentity signature verification |
| **GCP Auth** | GCP (Compute, Cloud Run, GKE) | GCP identity token (Compute Engine or IAM) |
| **Azure Auth** | Azure (VMs, Container Instances, App Service) | Azure managed identity token |
| **OIDC Auth** | GitHub Actions, GitLab CI, any OIDC provider | JWT from OIDC provider verified by Infisical |
| **LDAP Auth** | Enterprise with LDAP/AD | LDAP bind credentials |
| **SPIFFE Auth** | SPIFFE/SPIRE environments | JWT-SVID issued by SPIRE |
| **TLS Cert Auth** | mTLS environments | X.509 client certificate |
| **Alibaba Cloud Auth** | Alibaba Cloud | STS-based authentication |
| **OCI Auth** | Oracle Cloud | OCI signature verification |

**Quick decision tree:**

- "I'm on AWS" → **AWS Auth** (zero-secret, uses instance metadata)
- "I'm on Kubernetes" → **Kubernetes Auth** (zero-secret, uses service account tokens)
- "I'm in a CI/CD pipeline" → **OIDC Auth** (zero-secret, uses pipeline's OIDC token)
- "I'm on GCP" → **GCP Auth** (zero-secret)
- "I'm on Azure" → **Azure Auth** (zero-secret)
- "I just want something simple" → **Universal Auth** (Client ID + Secret)
- "I need a static token" → **Token Auth** (simplest, but less secure)

## General setup workflow

Regardless of auth method, the steps are:

### 1. Create a machine identity

**Organization-level** (can access multiple projects):
- Go to Organization Settings > Access Control > Machine Identities
- Click "Create Identity"
- Give it a name and assign an organization role

**Project-level** (scoped to one project):
- Go to Project > Access Control > Machine Identities
- Click "Add Identity"
- Give it a name and assign a project role

### 2. Configure an authentication method

After creating the identity, configure how it authenticates. By default, new identities get Universal Auth. You can remove it and add a different method.

### 3. Grant project access

If the identity was created at the org level, add it to specific projects:
- Go to Project Settings > Access Control > Machine Identities
- Select the identity and assign a project-level role

### 4. Authenticate and use

The workload authenticates via the relevant `/api/v1/<auth-method>/login` endpoint and receives an access token.

---

## Auth method details

### Universal Auth

The most flexible, platform-agnostic option. Works anywhere.

**How it works**: The workload exchanges a Client ID + Client Secret for a short-lived access token.

**Configuration options:**
- Access Token TTL (default: 7200s / 2 hours)
- Access Token Max TTL (maximum lifetime)
- Max Number of Uses (0 = unlimited)
- Trusted IPs (restrict to specific IP/CIDR ranges)
- Lockout protection (3 failed attempts in 30s → 5-minute lockout)

**API endpoint**: `POST /api/v1/auth/universal-auth/login`
```json
{
  "clientId": "<client-id>",
  "clientSecret": "<client-secret>"
}
```

**Client secrets** can have their own TTL, usage limits, and descriptions. You can create multiple secrets for rotation.

---

### Kubernetes Auth

Zero-secret authentication for Kubernetes pods.

**How it works**: The pod's service account JWT is sent to Infisical, which verifies it against the Kubernetes API server (TokenReview).

**Configuration options:**
- Kubernetes API host URL
- CA certificate of the K8s cluster
- Token Reviewer JWT (a service account with `system:auth-delegator` role)
- Allowed namespaces (comma-separated)
- Allowed service account names
- Allowed audiences
- Review mode: `Api` (direct) or `Gateway` (via Infisical gateway relay)

**API endpoint**: `POST /api/v1/auth/kubernetes-auth/login`
```json
{
  "identityId": "<identity-id>",
  "jwt": "<service-account-jwt>"
}
```

**Tip**: Map machine identities at the namespace level — one identity per namespace is a good starting point.

---

### AWS Auth

Zero-secret authentication for AWS workloads using IAM.

**How it works**: The workload generates a signed `sts:GetCallerIdentity` request and sends the signature to Infisical, which verifies it with AWS STS.

**Configuration options:**
- STS endpoint (default: `https://sts.amazonaws.com`)
- Allowed Principal ARNs (restrict to specific IAM roles/users)
- Allowed Account IDs

**API endpoint**: `POST /api/v1/auth/aws-auth/login`
```json
{
  "identityId": "<identity-id>",
  "iamHttpRequestMethod": "POST",
  "iamRequestBody": "<base64-encoded-sts-request-body>",
  "iamRequestHeaders": "<base64-encoded-sts-request-headers>"
}
```

**Works with**: EC2, Lambda, ECS, EKS (IRSA), Fargate, and any service with an IAM role.

---

### GCP Auth

Zero-secret authentication for GCP workloads.

**How it works**: The workload obtains a GCP identity token and sends it to Infisical for verification.

**Two modes:**
- **Compute Engine (`gce`)**: Uses instance metadata to get identity tokens. Extracts project ID, zone, instance ID.
- **IAM (`iam`)**: Uses service account credentials. Extracts email.

**Configuration options:**
- Auth type: `iam` or `gce`
- Allowed service account emails
- Allowed project IDs
- Allowed zones (for GCE)

**API endpoint**: `POST /api/v1/auth/gcp-auth/login`

---

### Azure Auth

Zero-secret authentication for Azure workloads using managed identities.

**How it works**: The workload obtains an Azure identity token (from the Instance Metadata Service) and sends it to Infisical.

**Configuration options:**
- Tenant ID
- Resource (the Azure resource the token was obtained for)
- Allowed Service Principal IDs

**API endpoint**: `POST /api/v1/auth/azure-auth/login`

---

### OIDC Auth

Platform-agnostic authentication using any OpenID Connect identity provider. Particularly useful for CI/CD pipelines.

**How it works**: The workload obtains a JWT from its OIDC provider and sends it to Infisical for verification.

**Configuration options:**
- OIDC Discovery URL
- CA Certificate (for custom providers)
- Bound Issuer (must match JWT `iss` claim)
- Bound Audiences (must match JWT `aud` claim)
- Bound Subject (must match JWT `sub` claim)
- Bound Claims (custom claim constraints as key-value pairs)

**Common OIDC providers:**
- **GitHub Actions**: Uses GitHub's built-in OIDC token (`ACTIONS_ID_TOKEN_REQUEST_TOKEN`)
- **GitLab CI**: Uses GitLab's `CI_JOB_JWT` or `id_tokens`
- **Any OIDC-compliant provider**

**API endpoint**: `POST /api/v1/auth/oidc-auth/login`

---

### Token Auth

The simplest auth method — a pre-generated bearer token.

**How it works**: You create a token in the Infisical UI and hand it to the workload. No exchange or verification needed — the workload includes it directly in API requests as a Bearer token.

**Configuration options:**
- Access Token TTL (default: 2592000s / 30 days)
- Access Token Max TTL
- Max Number of Uses (0 = unlimited)
- Trusted IPs

**Token renewal**: Tokens can be renewed (extended by their TTL increment) up to the Max TTL limit.

**When to use**: Quick integrations, testing, or environments where more sophisticated auth isn't possible. Less secure than other methods because the token is long-lived and static.

---

### SPIFFE Auth

For workloads in SPIFFE/SPIRE environments.

**How it works**: The workload presents a JWT-SVID issued by SPIRE, which Infisical verifies against the SPIRE trust bundle.

**Configuration options:**
- Trust domain
- Allowed SPIFFE IDs
- Allowed audiences
- Trust bundle distribution: `static` (configured directly) or `https_web` (fetched from endpoint)
- FIPS compliance: Only RS256/384/512, PS256/384/512, ES256/384/512 algorithms (Ed25519 excluded)

---

### TLS Certificate Auth

For mTLS environments.

**How it works**: The workload presents its X.509 client certificate. Infisical validates it against a configured CA certificate and checks the Common Name (CN).

**Configuration options:**
- CA Certificate (PEM)
- Allowed Common Names (comma-separated or regex patterns)

---

## Identity design best practices

- **Separate by application**: Each application should have its own identity to limit blast radius if compromised
- **Separate by security tier**: Payment processing, PII handling, and general services should use different identities
- **Consolidate for replicas**: Multiple replicas of the same app with identical secret needs can share one identity
- **Kubernetes**: Start with one identity per namespace
- **Blast radius thinking**: "If this identity is compromised, what can the attacker access?" — design boundaries accordingly

## Identity lockout

Protects against brute-force attacks. Supported on Universal Auth and LDAP Auth:
- Triggers after 3 failed attempts within 30 seconds
- Locks the identity for 5 minutes
- Configurable and can be disabled

## Relevant code paths

- `backend/src/services/identity-ua/` — Universal Auth service
- `backend/src/services/identity-kubernetes-auth/` — Kubernetes Auth service
- `backend/src/services/identity-aws-auth/` — AWS Auth service
- `backend/src/services/identity-gcp-auth/` — GCP Auth service
- `backend/src/services/identity-azure-auth/` — Azure Auth service
- `backend/src/services/identity-oidc-auth/` — OIDC Auth service
- `backend/src/services/identity-token-auth/` — Token Auth service
- `backend/src/services/identity-ldap-auth/` — LDAP Auth service
- `backend/src/services/identity-spiffe-auth/` — SPIFFE Auth service
- `backend/src/services/identity-tls-cert-auth/` — TLS Cert Auth service
- `backend/src/services/identity-alicloud-auth/` — Alibaba Cloud Auth service
- `backend/src/services/identity-oci-auth/` — OCI Auth service
- `backend/src/services/identity/` — Core identity management
- `docs/documentation/platform/identities/` — User-facing identity docs
