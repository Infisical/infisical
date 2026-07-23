# Machine Identity Authentication

This reference covers how to create machine identities and choose the right authentication method. A machine identity is how any non-human workload (app, container, CI job, serverless function) authenticates with Infisical to access secrets.

## Concept

A machine identity is like an IAM User (AWS), Service Account (GCP), or Service Principal (Azure). It:
1. Has a name and role determining what it can access
2. Has an authentication method determining how it proves its identity
3. Authenticates → receives a short-lived access token
4. Uses that token for API requests

## Creating a machine identity

### Organization-level (access to multiple projects)

1. Go to **Organization Settings > Access Control > Machine Identities**
2. Click **Create Identity**
3. Name it descriptively (e.g., `prod-api-server`, `github-actions-deploy`)
4. Assign an organization-level role
5. After creation, add it to specific projects with project-level roles

### Project-level (scoped to one project)

1. Go to **Project > Access Control > Machine Identities**
2. Click **Add Identity**
3. Name it and assign a project role

## Choosing an auth method

**Decision tree** — recommend based on the user's platform:

| Platform | Auth method | Why |
|----------|------------|-----|
| **AWS** (EC2, Lambda, ECS, Fargate, EKS) | AWS Auth | Zero-secret — uses IAM role, no credentials to manage |
| **Kubernetes** | Kubernetes Auth | Zero-secret — uses pod service account token |
| **GCP** (Compute, Cloud Run, GKE, Cloud Functions) | GCP Auth | Zero-secret — uses GCP identity token |
| **Azure** (VMs, ACI, App Service, AKS) | Azure Auth | Zero-secret — uses managed identity |
| **GitHub Actions** | OIDC Auth | Zero-secret — uses GitHub's built-in OIDC token |
| **GitLab CI** | OIDC Auth | Zero-secret — uses GitLab's CI_JOB_JWT |
| **Any OIDC provider** | OIDC Auth | Zero-secret — uses provider's JWT |
| **SPIFFE/SPIRE** | SPIFFE Auth | Zero-secret — uses JWT-SVID |
| **mTLS environments** | TLS Cert Auth | Uses X.509 client certificate |
| **Enterprise LDAP/AD** | LDAP Auth | Uses LDAP bind credentials |
| **Any platform (simple)** | Universal Auth | Client ID + Client Secret — works everywhere |
| **Quick testing** | Token Auth | Static bearer token — simplest but least secure |

**General rule**: If a zero-secret option exists for the user's platform, recommend it. Zero-secret auth means no credentials to store, rotate, or leak.

## Auth method details

### Universal Auth

Works anywhere. The workload exchanges a Client ID + Client Secret for a short-lived access token.

**Setup in Infisical dashboard:**
1. On the machine identity, add Universal Auth (this is the default)
2. Configure: Access Token TTL, Max TTL, Max Number of Uses, Trusted IPs
3. Create a Client Secret (can have its own TTL and usage limits)
4. Hand the Client ID and Client Secret to the workload

**API call:**
```
POST /api/v1/auth/universal-auth/login
{ "clientId": "<id>", "clientSecret": "<secret>" }
→ { "accessToken": "<short-lived-token>" }
```

**CLI:**
```bash
infisical login --method=universal-auth \
  --client-id=<id> --client-secret=<secret>
```

**Lockout protection**: 3 failed attempts in 30s → 5-minute lockout. Configurable.

### AWS Auth

For AWS workloads with IAM roles. The workload signs an `sts:GetCallerIdentity` request and sends the signature to Infisical for verification. No Infisical credentials stored on the machine.

**Setup:**
1. Add AWS Auth to the machine identity
2. Configure: STS endpoint, Allowed Principal ARNs, Allowed Account IDs
3. The workload uses its IAM role to authenticate automatically

Works with: EC2 (instance profile), Lambda (execution role), ECS/Fargate (task role), EKS with IRSA.

### Kubernetes Auth

For pods in Kubernetes clusters. The pod's service account token is verified via the Kubernetes TokenReview API.

**Setup:**
1. Create a token reviewer service account with `system:auth-delegator` role
2. Add Kubernetes Auth to the machine identity
3. Configure: K8s API host, CA cert, token reviewer JWT, allowed namespaces/service accounts
4. Pods authenticate using their service account token — no secrets needed

**Review modes:**
- `Api`: Operator calls K8s API directly
- `Gateway`: Routes through Infisical Gateway (for external clusters)

### GCP Auth

For GCP workloads. Two modes:
- **Compute Engine (`gce`)**: Uses instance metadata for identity tokens. Configure allowed projects, zones.
- **IAM (`iam`)**: Uses service account credentials. Configure allowed service account emails.

### Azure Auth

For Azure workloads with managed identities. Configure: Tenant ID, Resource, Allowed Service Principal IDs.

### OIDC Auth

For any OIDC-compliant provider (GitHub Actions, GitLab CI, custom IdPs). Verifies JWTs against the provider's discovery endpoint.

**Setup:**
1. Add OIDC Auth to the machine identity
2. Configure: Discovery URL, Bound Issuer, Bound Audiences, Bound Subject, Bound Claims
3. The workload sends its OIDC JWT to Infisical for verification

### Token Auth

Simplest option — a pre-generated bearer token. No exchange needed; the workload uses it directly. Good for quick testing, but less secure (long-lived, static).

**Setup:** Create a token in the UI, copy it, hand it to the workload.

### SPIFFE Auth

For SPIFFE/SPIRE environments. Verifies JWT-SVIDs against the SPIRE trust bundle. Supports static or HTTPS-based trust bundle distribution. FIPS-compliant (only RS/PS/ES algorithms, no Ed25519).

### TLS Certificate Auth

For mTLS environments. The workload presents an X.509 client certificate, verified against a configured CA. Constraints on allowed Common Names.

### LDAP Auth

For enterprise LDAP/Active Directory environments. Workload authenticates with LDAP bind credentials. Supports lockout protection.

## Design best practices

- **One identity per application** — limits blast radius if compromised
- **Separate by security tier** — payments, PII, and general services get different identities
- **Consolidate replicas** — 10 replicas of the same app with identical needs = 1 identity
- **Kubernetes: one identity per namespace** as a starting point
- **Think blast radius** — "if this identity is compromised, what can the attacker access?"

## Deprecated approaches (do not use)

- **Service Tokens** (`st.*` prefix): Legacy, limited API access. Use machine identities instead.
- **API Keys** (`X-API-Key` header): Deprecated, the backend rejects these.
