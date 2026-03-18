# Research Brief

## Topic
Rotating secrets in Infisical — manual rotation (updating a secret value) and automated rotation (provider-based credential rotation), covering UI, CLI, and API workflows.

## Summary
Infisical supports two forms of secret rotation: (1) manual rotation, where an administrator updates a secret's value through the UI, CLI, or API, which automatically creates a new version; and (2) automated secret rotation, which uses provider-specific integrations (e.g., PostgreSQL, AWS IAM, Auth0) to rotate credentials on a schedule. Automated rotation supports dual-phase (two credential sets with overlap for zero-downtime) and single-phase (immediate replacement) models depending on the provider.

## Audience
Platform engineers or administrators who need to rotate secrets safely without breaking applications.

## Technical Details

### Secret Versioning Behavior During Rotation

Every time a secret value is changed (whether manually or via automated rotation), Infisical creates a new immutable version record. Key details:

- **Automatic versioning**: Every secret mutation (create, update, delete) creates a new version with an incremented version number.
- **Version data stored**: version number, key name, encrypted value, encrypted comment, metadata, environment ID, actor information (user or machine identity who made the change), timestamps.
- **Accessing versions**: Via the secret sidebar in the UI (opening the secret drawer) or via API with the `version` query parameter on `GET /api/v4/secrets/{secretName}`.
- **Rollback**: Currently manual — copy an old version's value and update the secret, which creates a new version at the top of the stack. Automatic rollback is planned but not yet available.
- **Point-in-Time Recovery**: Secret versioning connects to PIT Recovery, which uses snapshots or folder commits to restore secrets to a previous state (EE feature).
- **Version pruning**: Projects have a configurable `pitVersionLimit` that controls how many versions are retained. Oldest versions are pruned automatically.

Source: `/docs/documentation/platform/secret-versioning.mdx`, backend code in `secret-version-dal.ts`, `secret-v2-bridge-fns.ts`

### Manual Secret Rotation via UI

1. Navigate to the Secret Manager project dashboard.
2. Locate the secret to rotate in the secrets list.
3. Click on the secret to open the secret sidebar/drawer.
4. Edit the "Value" field with the new secret value.
5. Save the change.
6. A new version is automatically created and becomes the active version.
7. To verify, reopen the sidebar and check the version history — the new version appears at the top.

[ASSUMED: The exact UI flow for editing a secret value is inferred from the secret versioning docs and general UI patterns described in the codebase. The secret sidebar/drawer is confirmed in the versioning docs.]

Source: `/docs/documentation/platform/secret-versioning.mdx`, `/docs/documentation/platform/project.mdx`

### Manual Secret Rotation via CLI

The Infisical CLI supports updating secrets with `infisical secrets set`:

```bash
infisical secrets set <KEY>=<NEW_VALUE>
```

**Prerequisites:**
- Infisical CLI installed and authenticated (`infisical login`)
- Project initialized locally (`infisical init`) or `--projectId` flag provided
- Appropriate permissions to write secrets in the target environment

**Key flags:**
- `--env` — Environment name (default: `dev`)
- `--path` — Project folder path (default: `/`)
- `--type` — Secret type: `personal` or `shared` (default: `shared`)
- `--projectId` — Project ID (required when using machine identity auth)

**Examples:**
```bash
# Rotate a database password in production
infisical secrets set DB_PASSWORD=new-secure-password-123 --env=prod

# Rotate multiple secrets at once
infisical secrets set API_KEY=new-api-key DB_PASSWORD=new-db-password --env=prod

# Set secret value from a file (e.g., rotating a certificate)
infisical secrets set CERTIFICATE=@/path/to/new-cert.pem --env=prod
```

**Verification via CLI:**
```bash
# Retrieve the secret to confirm the new value
infisical secrets get DB_PASSWORD --env=prod
```

**Note:** There is no dedicated CLI rotation command. Secret rotation through the CLI is performed by updating the secret value with `secrets set`. Automated provider-based rotation is not available via CLI.

Source: `/docs/cli/commands/secrets.mdx`

### Manual Secret Rotation via API

**Update a secret (rotate its value):**
- **Method:** `PATCH /api/v4/secrets/{secretName}`
- **Authentication:** Bearer token (JWT, IDENTITY_ACCESS_TOKEN, or SERVICE_TOKEN [deprecated])
- **Request body:**
  - `projectId` (required) — Project identifier
  - `environment` (required) — Environment slug (e.g., `prod`, `dev`)
  - `secretPath` (optional, default: `/`) — Folder path
  - `secretValue` (required for rotation) — The new secret value
  - `type` (optional) — Secret type
- **Response:** Updated secret object with new version

**Retrieve a secret (verify rotation):**
- **Method:** `GET /api/v4/secrets/{secretName}`
- **Query parameters:**
  - `projectId` (required)
  - `environment` (required)
  - `secretPath` (optional, default: `/`)
  - `version` (optional) — Specific version number; omit for latest

**List secret versions:**
- **Method:** `GET /api/v1/dashboard/secret-versions/{secretId}`
- **Query parameters:**
  - `offset` (required) — Pagination offset
  - `limit` (required) — Page size
- **Authentication:** JWT only
- **Response:** Array of version records with metadata

**Get specific version value:**
- **Method:** `GET /api/v1/dashboard/secret-versions/{secretId}/value/{version}`
- **Authentication:** JWT only

Source: backend route definitions in `secret-router.ts`, `dashboard-router.ts`

### Automated Secret Rotation (Provider-Based)

Infisical supports automated rotation for 16+ credential types via provider integrations. These are managed through the UI and API (not CLI).

**Two rotation models:**

1. **Dual-Phase Rotation** (zero-downtime):
   - Maintains two credential sets with overlapping validity.
   - Credential lifecycle: Active → Inactive → Revoked.
   - Grace period between changes allows applications to update.
   - Used by: PostgreSQL, MySQL, MSSQL, OracleDB, MongoDB, Redis, AWS IAM, Azure, Okta, Databricks, dbt, OpenRouter.

2. **Single-Phase Rotation** (immediate replacement):
   - Old credentials invalidated immediately upon rotation.
   - Risk of service interruption; recommended to disable auto-rotation or coordinate carefully.
   - Used by: Auth0, LDAP, Unix/Linux local accounts, Windows local accounts.

**Common configuration fields:**
- `connectionId` — ID of the pre-configured app connection
- `isAutoRotationEnabled` — Boolean toggle
- `rotationInterval` — Days between rotations
- `rotateAtUtc` — UTC time of day for rotation (hours, minutes)
- `parameters` — Provider-specific settings
- `secretsMapping` — Maps generated credentials to secret names in the project

**UI workflow for automated rotation:**
1. Navigate to Secret Manager project → click "Add Secret Rotation"
2. Select rotation type (e.g., PostgreSQL Credentials)
3. Configure connection and rotation schedule
4. Set provider-specific parameters (e.g., database usernames, rotation statements)
5. Map rotated credentials to secret names
6. Name and describe the rotation
7. Review and confirm

**API endpoints for automated rotation:**
- `POST /api/v2/secret-rotations/{provider-type}` — Create rotation
- `GET /api/v2/secret-rotations` — List rotations
- `GET /api/v2/secret-rotations/{id}` — Get rotation by ID
- `PATCH /api/v2/secret-rotations/{id}` — Update rotation
- `DELETE /api/v2/secret-rotations/{id}` — Delete rotation
- `POST /api/v2/secret-rotations/{id}/rotate` — Trigger immediate rotation

Source: deleted docs from `docs/documentation/platform/secret-rotation/`, backend route definitions

### How Applications Retrieve Updated Secrets

After a secret is rotated, applications receive the updated value through one of these mechanisms:

| Method | Update Detection | Default Frequency | Notes |
|--------|-----------------|-------------------|-------|
| **SDKs** (Node.js, Python, Go, Java, .NET, etc.) | Application re-fetches | On-demand (cache TTL ~60s) | Must call fetch methods again; SDK caching with configurable TTL |
| **Infisical Agent** | Polling | 5 minutes (configurable) | Can execute a command on secret change; writes to file templates |
| **Kubernetes Operator** (InfisicalSecret CRD) | Event-driven watch | Near real-time | Can auto-reload Deployments when secrets update |
| **Kubernetes CSI Provider** | Polling (if enabled) | 2 minutes (configurable) | Requires `enableSecretRotation=true` in CSI driver config |
| **Secret Syncs** | Push-based | Automatic | Syncs to 50+ external services (AWS SM, GitHub, Vercel, etc.) |
| **CLI (`infisical run`)** | Per execution | One-time at process start | Fresh retrieval each time; restart process to get new values |
| **Docker integration** | Per container start | One-time | `docker run --env-file <(infisical export --format=dotenv)` |

Source: SDK docs, agent docs, Kubernetes operator docs, CSI docs, secret syncs overview

## Prerequisites

For any secret rotation:
- An Infisical account with access to the target project
- Appropriate role/permissions to write secrets in the target environment
- For CLI: Infisical CLI installed and authenticated
- For API: Valid authentication token (JWT or machine identity access token)

For automated provider-based rotation:
- A pre-configured app connection of the appropriate type (e.g., AWS Connection, PostgreSQL Connection) with "Secret Rotation" permissions
- Network access from Infisical to the target system
- Provider-specific prerequisites (e.g., two database users for dual-phase database rotation, application client IDs for cloud provider rotation)

## Related Resources
- Secret versioning documentation: `/docs/documentation/platform/secret-versioning.mdx`
- Point-in-Time Recovery: `/docs/documentation/platform/pit-recovery.mdx`
- CLI secrets commands: `/docs/cli/commands/secrets.mdx`
- API secrets reference: `/docs/api-reference/endpoints/secrets/`
- Infisical Agent: `/docs/integrations/platforms/infisical-agent.mdx`
- Kubernetes Operator: `/docs/integrations/platforms/kubernetes/overview.mdx`
- SDK documentation: `/docs/sdks/`
- Secret syncs overview: `/docs/integrations/secret-syncs/overview.mdx`
- App connections: `/docs/integrations/app-connections/`

## Flagged Items
- [ASSUMED: The exact UI flow for manually editing a secret value is inferred from the secret versioning docs and project drawer documentation. Exact click-by-click steps may differ.]
- [ASSUMED: The automated rotation API endpoints (`/api/v2/secret-rotations/*`) are reconstructed from deleted documentation on the current branch. These endpoints likely still exist in the backend but the docs were removed as part of a restructuring.]
- [UNKNOWN: Whether there is a webhook or event notification mechanism that fires when a secret is rotated, which could be used for zero-downtime rotation coordination.]
- [UNKNOWN: Exact permissions/roles required to perform secret rotation (e.g., specific CASL permission names).]

## Sources
- `/docs/documentation/platform/secret-versioning.mdx`
- `/docs/documentation/platform/secret-rotation/overview.mdx` (from git history, deleted on current branch)
- `/docs/documentation/platform/secret-rotation/*.mdx` (from git history, deleted on current branch)
- `/docs/cli/commands/secrets.mdx`
- `/docs/api-reference/endpoints/secrets/`
- `/docs/sdks/languages/node.mdx`, `python.mdx`, `go.mdx`
- `/docs/integrations/platforms/infisical-agent.mdx`
- `/docs/integrations/platforms/kubernetes/overview.mdx`
- `/docs/integrations/platforms/kubernetes-csi.mdx`
- `/docs/integrations/secret-syncs/overview.mdx`
- `/backend/src/server/routes/v4/secret-router.ts`
- `/backend/src/server/routes/v1/dashboard-router.ts`
- `/backend/src/services/secret-v2-bridge/secret-version-dal.ts`
- `/backend/src/services/secret-v2-bridge/secret-v2-bridge-fns.ts`
