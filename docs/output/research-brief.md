# Research Brief

## Topic
Configuring OIDC authentication between Bitbucket Pipelines and Infisical to securely access secrets during CI/CD runs without long-lived credentials.

## Summary
Bitbucket Pipelines supports OIDC token issuance natively, exposing a signed JWT via the `$BITBUCKET_STEP_OIDC_TOKEN` environment variable when `oidc: true` is set on a pipeline step. Infisical supports OIDC Auth as a machine identity authentication method, validating JWTs against configurable issuer, subject, audience, and claims constraints. By creating a machine identity in Infisical with OIDC Auth configured for Bitbucket's identity provider, pipelines can authenticate and retrieve secrets without storing any static credentials.

## Audience
Platform engineers or DevOps engineers who need to authenticate Bitbucket pipelines to Infisical without using long-lived credentials.

## Technical Details

### OIDC Auth Architecture in Infisical

**Source files:**
- `backend/src/services/identity-oidc-auth/identity-oidc-auth-service.ts` — Core service with `login`, `attachOidcAuth`, `updateOidcAuth`, `getOidcAuth`, `revokeOidcAuth` methods
- `backend/src/services/identity-oidc-auth/identity-oidc-auth-types.ts` — Type definitions
- `backend/src/server/routes/v1/identity-oidc-auth-router.ts` — API route definitions
- `backend/src/db/schemas/identity-oidc-auths.ts` — DB schema
- `backend/src/services/identity-oidc-auth/identity-oidc-auth-fns.ts` — Validation helpers (glob matching via picomatch)
- `backend/src/services/identity-oidc-auth/identity-oidc-auth-validators.ts` — Zod validators

**Login flow (from service code):**
1. Client sends `identityId` + `jwt` (the OIDC token) to the login endpoint.
2. Infisical looks up the OIDC auth config for that identity.
3. Infisical fetches the OIDC discovery document from `{oidcDiscoveryUrl}/.well-known/openid-configuration` to get `jwks_uri`.
4. Infisical retrieves signing keys from the JWKS endpoint.
5. JWT signature is verified using the public key (by `kid` if present, or tries all keys up to 10).
6. JWT `iss` claim is validated against the configured `boundIssuer`.
7. JWT `sub` claim is validated against `boundSubject` (supports glob patterns via picomatch).
8. JWT `aud` claim is validated against `boundAudiences` (comma-separated, supports glob patterns).
9. Additional `boundClaims` are validated (key-value pairs, supports dot-notation access into nested claims, supports glob patterns).
10. `claimMetadataMapping` extracts specific claims from the token into the access token's metadata.
11. If all checks pass, a short-lived Infisical access token is created and returned.

**DB schema (identity_oidc_auths table):**
- `id` (uuid)
- `accessTokenTTL` (number, default 7200)
- `accessTokenMaxTTL` (number, default 7200)
- `accessTokenNumUsesLimit` (number, default 0)
- `accessTokenTrustedIps` (json)
- `identityId` (uuid, FK to identities)
- `oidcDiscoveryUrl` (string)
- `boundIssuer` (string)
- `boundAudiences` (string)
- `boundClaims` (json object)
- `boundSubject` (string, nullable)
- `encryptedCaCertificate` (buffer, nullable)
- `claimMetadataMapping` (json, nullable)
- `accessTokenPeriod` (number, default 0)

### Endpoints

**Login (unauthenticated):**
- `POST /api/v1/auth/oidc-auth/login`
- Body: `{ identityId: string, jwt: string, organizationSlug?: string }`
- Response: `{ accessToken: string, expiresIn: number, accessTokenMaxTTL: number, tokenType: "Bearer" }`
- Rate limited by `writeLimit`

**Attach OIDC Auth (authenticated):**
- `POST /api/v1/auth/oidc-auth/identities/:identityId`
- Auth: JWT or IDENTITY_ACCESS_TOKEN
- Body:
  - `oidcDiscoveryUrl` (string, URL, required)
  - `caCert` (string, default "")
  - `boundIssuer` (string, required)
  - `boundAudiences` (string, default "")
  - `boundClaims` (Record<string, string>, default {})
  - `claimMetadataMapping` (Record<string, string>, optional)
  - `boundSubject` (string, default "")
  - `accessTokenTrustedIps` (array, default `[{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }]`)
  - `accessTokenTTL` (number, default 2592000, max 315360000)
  - `accessTokenMaxTTL` (number, default 2592000, max 315360000)
  - `accessTokenNumUsesLimit` (number, default 0)

**Update OIDC Auth (authenticated):**
- `PATCH /api/v1/auth/oidc-auth/identities/:identityId`
- Same fields as attach, all optional (partial update)

**Get OIDC Auth (authenticated):**
- `GET /api/v1/auth/oidc-auth/identities/:identityId`

**Delete/Revoke OIDC Auth (authenticated):**
- `DELETE /api/v1/auth/oidc-auth/identities/:identityId`

### UI Workflow

Based on the existing OIDC auth docs pattern (consistent across GitHub, GitLab, CircleCI, etc.):

1. Navigate to Organization Settings > Access Control > Identities
2. Press **Create identity** -- provide Name and Role
   - [Screenshot: identities-org.png — Infisical org identities page]
   - [Screenshot: identities-org-create.png — Create identity modal]
3. On the identity page, edit the Authentication section
4. Remove the default Universal Auth configuration
   - [Screenshot: identities-page-remove-default-auth.png — Removing Universal Auth]
5. Add new OIDC Auth configuration with Bitbucket-specific values
   - [Screenshot: identities-org-create-oidc-auth-method.png — OIDC Auth configuration form]
6. Add identity to target project(s): Project Settings > Access Control > Machine Identities > Add identity
   - [Screenshot: identities-project.png — Project machine identities page]
   - [Screenshot: identities-project-create.png — Adding identity to project]

### Configuration Options

**Bitbucket-specific OIDC configuration values for Infisical:**

| Field | Value for Bitbucket |
|-------|-------------------|
| OIDC Discovery URL | `https://api.bitbucket.org/2.0/workspaces/{WORKSPACE}/pipelines-config/identity/oidc` [EXTERNAL: https://support.atlassian.com/bitbucket-cloud/docs/deploy-on-aws-using-bitbucket-pipelines-openid-connect/] |
| Issuer (boundIssuer) | `https://api.bitbucket.org/2.0/workspaces/{WORKSPACE}/pipelines-config/identity/oidc` [EXTERNAL: same source — the issuer URL matches the discovery URL] |
| CA Certificate | Leave blank (Bitbucket Cloud uses publicly trusted certs) |
| Subject (boundSubject) | Format: `{REPOSITORY_UUID}:{ENVIRONMENT_UUID}:{STEP_UUID}` or `{REPOSITORY_UUID}:{STEP_UUID}` (without environment UUID if step is not assigned to a deployment environment). Glob patterns supported. [EXTERNAL: same source] |
| Audiences (boundAudiences) | The audience value is the workspace identifier by default. Can also be customized in the pipeline YAML (up to 10 audiences, max 150 chars each). Find the value in Repository Settings > OpenID Connect. [EXTERNAL: same source] |
| Claims (boundClaims) | Available claims include: `repositoryUuid`, `workspaceUuid`, `pipelineUuid`, `stepUuid`, `deploymentEnvironment`, `branchName`. [EXTERNAL: same source] |

**Where to find the Identity Provider URL in Bitbucket:**
Repository Settings > Pipelines > OpenID Connect [EXTERNAL: same source]

### Bitbucket Pipeline Configuration

[EXTERNAL: https://support.atlassian.com/bitbucket-cloud/docs/integrate-pipelines-with-resource-servers-using-oidc/ and https://support.atlassian.com/bitbucket-cloud/docs/deploy-on-aws-using-bitbucket-pipelines-openid-connect/]

**Enabling OIDC in a pipeline step:**
Set `oidc: true` at the step level in `bitbucket-pipelines.yml`. The OIDC token is then available as the environment variable `$BITBUCKET_STEP_OIDC_TOKEN`.

**Custom audiences (optional):**
```yaml
options:
  oidc:
    audiences:
      - https://your.service.com
```

**Audience limits:** Max 10 audiences, max 150 characters per audience name.

**Token claims available in the Bitbucket OIDC JWT:**
- `iss` — Issuer URL (`https://api.bitbucket.org/2.0/workspaces/{WORKSPACE}/pipelines-config/identity/oidc`)
- `sub` — Subject (`{REPOSITORY_UUID}[:{ENVIRONMENT_UUID}]:{STEP_UUID}`)
- `aud` — Audience (workspace identifier or custom)
- `exp` — Expiration time
- `iat` — Issued at time
- `repositoryUuid` — Repository UUID
- `workspaceUuid` — Workspace UUID
- `pipelineUuid` — Pipeline UUID
- `stepUuid` — Step UUID
- `deploymentEnvironment` — Deployment environment name (when assigned)
- `branchName` — Branch name

### Infisical CLI/SDK Usage

**CLI authentication with OIDC:**
```bash
infisical login --method=oidc-auth --machine-identity-id=<machine-identity-id> --oidc-jwt=$BITBUCKET_STEP_OIDC_TOKEN --silent --plain
```
This returns an access token. Set it as `INFISICAL_TOKEN` and use `infisical run` to inject secrets.

**Full pipeline example (following GitLab doc pattern):**
```yaml
image: atlassian/default-image:3

pipelines:
  default:
    - step:
        name: Build application with secrets from Infisical
        oidc: true
        script:
          - apt update && apt install -y curl
          - curl -1sLf 'https://artifacts-cli.infisical.com/setup.deb.sh' | bash
          - apt-get update && apt-get install -y infisical
          - export INFISICAL_TOKEN=$(infisical login --method=oidc-auth --machine-identity-id=<your-machine-identity-id> --oidc-jwt=$BITBUCKET_STEP_OIDC_TOKEN --silent --plain)
          - infisical run --projectId=<your-project-id> --env=dev -- npm run build
```

**Python SDK:**
```python
response = client.auth.oidc_auth.login(
    identity_id="<oidc-identity-id>",
    jwt="<your-oidc-jwt-token>"  # $BITBUCKET_STEP_OIDC_TOKEN value
)
```

**Direct API call:**
```bash
curl -X POST https://app.infisical.com/api/v1/auth/oidc-auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "identityId=<your-identity-id>&jwt=$BITBUCKET_STEP_OIDC_TOKEN"
```

Response:
```json
{
  "accessToken": "...",
  "expiresIn": 7200,
  "accessTokenMaxTTL": 43244,
  "tokenType": "Bearer"
}
```

### Concepts

1. **Machine Identity**: An entity in Infisical representing a workload/application. Must be created and assigned a role before it can access resources.
2. **OIDC Auth**: A platform-agnostic JWT-based authentication method. Infisical validates JWTs from any OIDC-compliant identity provider by fetching public keys via OIDC Discovery.
3. **Bound fields**: Constraints (issuer, subject, audiences, claims) that the incoming JWT must satisfy. These support glob pattern matching via picomatch (e.g., `{repo-uuid}:*` to match any environment/step).
4. **Access Token**: The short-lived token returned by Infisical after successful OIDC authentication. Used to make authenticated API requests.
5. **OIDC Discovery**: The standard protocol where Infisical fetches `/.well-known/openid-configuration` from the discovery URL to locate the JWKS endpoint for key verification.

## Prerequisites

1. An Infisical account (Cloud or self-hosted instance)
2. A Bitbucket Cloud workspace with Pipelines enabled
3. A Bitbucket repository with a `bitbucket-pipelines.yml` file
4. Secrets stored in an Infisical project
5. Infisical must have network access to Bitbucket's OIDC endpoints (`https://api.bitbucket.org/...`)
6. [ASSUMED] Bitbucket Pipelines OIDC is available on all Bitbucket Cloud plans that support Pipelines — the Atlassian docs do not specify plan-level restrictions for this feature

## Related Resources

- General OIDC Auth docs: `docs/documentation/platform/identities/oidc-auth/general.mdx`
- GitHub OIDC Auth: `docs/documentation/platform/identities/oidc-auth/github.mdx`
- GitLab OIDC Auth: `docs/documentation/platform/identities/oidc-auth/gitlab.mdx`
- CircleCI OIDC Auth: `docs/documentation/platform/identities/oidc-auth/circleci.mdx`
- Terraform Cloud OIDC Auth: `docs/documentation/platform/identities/oidc-auth/terraform-cloud.mdx`
- Machine Identities overview: `docs/documentation/platform/identities/machine-identities.mdx`
- Existing Bitbucket CI/CD doc (Universal Auth): `docs/integrations/cicd/bitbucket.mdx`
- CLI login docs: `docs/cli/commands/login.mdx`
- Python SDK OIDC: `docs/sdks/languages/python.mdx`
- GitHub Actions CI/CD: `docs/integrations/cicd/githubactions.mdx`
- Docs navigation config: `docs/docs.json`

## Flagged Items

- [ASSUMED] The Bitbucket OIDC issuer URL is the same as the discovery URL: `https://api.bitbucket.org/2.0/workspaces/{WORKSPACE}/pipelines-config/identity/oidc`. This is based on the AWS deployment guide pattern where the issuer matches the Identity Provider URL shown in Bitbucket settings.
- [ASSUMED] Bitbucket Pipelines OIDC is available on all Bitbucket Cloud plans that support Pipelines. The Atlassian docs do not mention plan-level restrictions.
- [UNKNOWN] The complete, exhaustive list of JWT claims in the Bitbucket OIDC token. The claims listed (`repositoryUuid`, `workspaceUuid`, `pipelineUuid`, `stepUuid`, `deploymentEnvironment`, `branchName`) are confirmed from multiple sources, but there may be additional claims.
- [UNKNOWN] Whether Bitbucket Server/Data Center (self-hosted) supports OIDC for pipelines. The research only confirms Bitbucket Cloud support.
- [UNKNOWN] The exact format of the `{WORKSPACE}` placeholder in the issuer URL — whether it is the workspace slug or UUID. Users should copy the exact URL from Bitbucket Repository Settings > OpenID Connect.
- [STALE] The existing Bitbucket CI/CD doc (`docs/integrations/cicd/bitbucket.mdx`) only covers Universal Auth with client ID/secret.

## Sources

1. `backend/src/services/identity-oidc-auth/identity-oidc-auth-service.ts`
2. `backend/src/services/identity-oidc-auth/identity-oidc-auth-types.ts`
3. `backend/src/server/routes/v1/identity-oidc-auth-router.ts`
4. `backend/src/db/schemas/identity-oidc-auths.ts`
5. `backend/src/services/identity-oidc-auth/identity-oidc-auth-fns.ts`
6. `backend/src/services/identity-oidc-auth/identity-oidc-auth-validators.ts`
7. `backend/src/lib/api-docs/constants.ts`
8. `docs/documentation/platform/identities/oidc-auth/general.mdx`
9. `docs/documentation/platform/identities/oidc-auth/github.mdx`
10. `docs/documentation/platform/identities/oidc-auth/gitlab.mdx`
11. `docs/documentation/platform/identities/oidc-auth/circleci.mdx`
12. `docs/documentation/platform/identities/oidc-auth/terraform-cloud.mdx`
13. `docs/documentation/platform/identities/machine-identities.mdx`
14. `docs/integrations/cicd/bitbucket.mdx`
15. `docs/cli/commands/login.mdx`
16. `docs/sdks/languages/python.mdx`
17. `docs/integrations/cicd/githubactions.mdx`
18. `docs/docs.json`
19. [EXTERNAL] https://support.atlassian.com/bitbucket-cloud/docs/integrate-pipelines-with-resource-servers-using-oidc/
20. [EXTERNAL] https://support.atlassian.com/bitbucket-cloud/docs/deploy-on-aws-using-bitbucket-pipelines-openid-connect/
