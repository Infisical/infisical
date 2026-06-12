# PAM Backend — CLAUDE.md

Any core logic, shared helper, or convention introduced for PAM must be documented here. This file is the source of truth for PAM backend patterns.

## Module Layout

All PAM services live under `backend/src/ee/services/pam-*/`:

| Directory | Purpose |
|---|---|
| `pam/` | Shared enums (`PamAccountType`, `PamResourceRole`, `PamProductRole`, `PamSessionStatus`, `PamAccessMethod`), shared permission helpers (`pam-permission.ts`), validators (`pam-validators.ts`), and this CLAUDE.md |
| `pam-folder/` | Folder CRUD, folder-level permission checks |
| `pam-account/` | Account CRUD, credential encryption, gateway attachment, SSH CA management |
| `pam-account-template/` | Account templates (type + access policy + settings), template config schemas (`pam-account-template-schemas.ts`) |
| `pam-session/` | Session lifecycle (DAL, service, types) |
| `pam-session-recording/` | Recording chunk storage, retrieval, secrets, and storage providers (`aws-s3/`, `postgres/`) |
| `pam-membership/` | Product + resource membership management |
| `pam-project/` | PAM project bootstrap and resolver (formerly `pam-instance/`) |
| `pam-web-access/` | WebSocket session handlers (Postgres, SSH), ticket-based auth |

Routes live in `backend/src/ee/routes/v1/pam-routers/`.

## Permission Model

PAM uses a two-tier permission system: product membership + resource membership.

### Shared Helpers (`pam/pam-permission.ts`)

All PAM services import from this module rather than duplicating permission logic.

- **`TActorContext`** -- standard actor fields: `{ actorId, actor, actorOrgId, actorAuthMethod }`
- **`verifyProductMembership(permissionService, projectId, ctx)`** -- confirms the actor is a member of the PAM project. Returns `{ hasRole }` for checking product-level roles (Admin/Member).
- **`checkFolderPermission(permissionService, folderId, projectId, ctx)`** -- checks resource-scoped permission on a folder. Returns `{ permission }` for `throwUnlessCan` calls.
- **`checkAccountAccess(permissionService, accountId, folderId, projectId, action, ctx)`** -- tries folder-level permission first (if the account has a folder), falls back to direct account-level permission. This is the standard pattern for any account-scoped action.
- **`getResourceIdsWithActions(membershipDAL, membershipRoleDAL, projectId, actions, ctx)`** -- returns `{ folderIds, accountIds }` filtered to resources where the actor's role grants the specified actions. `actions` is `{ allOf?: [...], anyOf?: [...] }` where `allOf` requires every action and `anyOf` requires at least one. Filters out inactive memberships (`isActive: false`) and expired temporary roles (`isTemporary: true` with past `temporaryAccessEndTime`).

Services create thin local wrappers that bind their own `permissionService` dependency:
```ts
const verifyMembership = (projectId, ctx) => verifyProductMembership(permissionService, projectId, ctx);
const checkAccount = (accountId, folderId, projectId, action, ctx) => checkAccountAccess(permissionService, ...);
```

### Permission Enforcement Per Endpoint

Every list/mutation endpoint checks action-level permissions, not just membership:

| Endpoint | Required Permission |
|---|---|
| List folders | `ReadFolder` (via `getResourceIdsWithActions`) |
| List accounts | `ReadAccounts` (via `getResourceIdsWithActions`) |
| List accessible accounts | `ReadAccounts` AND (`LaunchSessions` OR `ViewCredentials`) |
| List sessions | `ViewSessions` (via `getResourceIdsWithActions`) |
| List folder/account members | `ManageMembers` (via `checkManageMembers`) |
| Get account by ID | `ReadAccounts` (via `checkAccountAccess`) |
| Launch session / web access | `LaunchSessions` (via `checkAccountAccess`) |
| View recording | `ViewSessions` (via `checkAccountAccess`) |
| Create account | `CreateAccounts` (via folder permission) |
| Edit/delete account | `EditAccounts`/`DeleteAccounts` (via `checkAccountAccess`) |
| Edit/delete folder | `EditFolder`/`DeleteFolder` (via folder permission) |
| Template list/getById | Product membership only (templates are project-wide config) |
| Template create/update/delete | Product Admin |

### Auth Modes

All PAM endpoints use `AuthMode.JWT` only (user access). `IDENTITY_ACCESS_TOKEN` is not supported. Gateway-facing endpoints (chunk upload, session credentials) use `AuthMode.GATEWAY_ACCESS_TOKEN`.

### Roles

- **Product roles** (`PamProductRole`): `Admin`, `Member`
- **Resource roles** (`PamResourceRole`): `Admin`, `Requester`, `Auditor`, `Connector`

Resource memberships are scoped to either a `PamFolder` or a `PamAccount` via the generic membership system (`ResourceType.PamFolder` / `ResourceType.PamAccount`).

## Account Types

Defined in `pam/pam-enums.ts` as `PamAccountType`. Validation schemas per type live in `pam-account/pam-account-schemas.ts` in the `ACCOUNT_TYPE_CONFIGS` map.

### Key Helpers

- **`extractGatewayTarget(accountType, rawConnectionDetails)`** -- validated extraction of `{ host, port }` from decrypted connection details, dispatched by account type. Use this instead of raw type casts.
- **`PamAccessMethod`** enum (`Web`, `Cli`) -- use instead of hardcoded `"web"`/`"cli"` strings.

### Adding a New Account Type

1. Add the enum value to `PamAccountType` in `pam/pam-enums.ts`
2. Add `connectionDetails` and `credentials` Zod schemas to `ACCOUNT_TYPE_CONFIGS` in `pam-account/pam-account-schemas.ts`
3. Add a case to `extractGatewayTarget` in `pam-account-schemas.ts`
4. If it supports web access: add a session handler in `pam-web-access/` and register it in `pam-session-handler-registry.ts`
5. Add the corresponding frontend enum value and any UI components
6. Update `PamAccountType` on the frontend enum in `frontend/src/hooks/api/pam/enums.ts`

The router's `ConnectionDetailsSchema` and `SanitizedAccountDetailSchema` auto-derive from `ACCOUNT_TYPE_CONFIGS`, so no router changes are needed for new types.

## Session Lifecycle

- Sessions reference accounts via nullable `accountId` (SET NULL on delete) so session history survives account deletion
- Orphaned sessions (accountId is null) are excluded from all queries: `listSessions` filters them at the SQL level via joins, `getSessionById` returns null
- Active sessions track `status` (Starting -> Active -> Ended) with timestamps
- Recording secrets are generated on first credential fetch and stored encrypted on the session row
- Sessions accept an optional `duration` parameter (parsed by `ms()`) capped at the template's `maxSessionDurationSeconds`. Default is 1 hour (`DEFAULT_SESSION_DURATION_MS`).
- Session expiration is enforced via a BullMQ delayed job (`pamSessionExpirationService`). The job is scheduled at session creation time and calls `endSessionById` when it fires.

## DAL Conventions

- Read methods use `db.replicaNode()`, writes hit primary
- All methods accept optional `tx` for transaction threading
- List queries that respect permissions use the accessible-resource pattern: join to the resource table and filter with `WHERE (folderId IN (...) OR accountId IN (...))`
- Gateway joins (for `gatewayName`/`gatewayIdentityId`) are repeated per-method since the select/join context differs

## Deferred Cleanup

Old tables, columns, and code kept temporarily so data can be recovered if the migration causes issues. Target removal: ~1 month after all deployments are running the new model (safe after 2026-08-01). A follow-up migration should handle the drops.

### Stale queue cleanup entries

`backend/src/queue/queue-service.ts` stale queue list includes `pam-account-rotation`, `pam-session-ai-summary`, and `pam-discovery-scan`. These ensure existing Redis instances get cleaned up on deploy. Remove them from the list after all deployments have booted at least once with the new code.

### Tables to drop

- `pam_resources`
- `pam_domains`
- `pam_account_policies`
- `pam_resource_rotation_rules`
- `pam_account_dependencies`
- `pam_resource_favorites`
- `pam_project_recording_configs`
- `pam_discovery_sources`, `pam_discovery_source_runs`, `pam_discovery_source_resources`, `pam_discovery_source_accounts`, `pam_discovery_source_dependencies` (when discovery is reimplemented)
- `pam_session_event_batches` (legacy logging, replaced by chunks)

### Columns to drop from `pam_accounts`

`resourceId`, `domainId`, `policyId`, `lastRotatedAt`, `rotationStatus`, `encryptedLastRotationMessage`, `requireMfa`, `internalMetadata`, `discoveryFingerprint`

### Columns to drop from `pam_sessions`

`resourceName`, `resourceId`, `selectedResourceId`, `encryptedAiInsights`, `aiInsightsStatus`, `aiInsightsError`, `encryptedLogsBlob`

## DI Wiring

All PAM factories are wired in `backend/src/server/routes/index.ts`. When adding a new dependency to a PAM service, update the wiring there and narrow the type with `Pick<>` in the service's dependency type.
