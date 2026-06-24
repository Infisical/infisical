# PAM Backend — CLAUDE.md

Any core logic, shared helper, or convention introduced for PAM must be documented here. This file is the source of truth for PAM backend patterns.

## Module Layout

All PAM services live under `backend/src/ee/services/pam-*/`:

| Directory | Purpose |
|---|---|
| `pam/` | Shared enums (`PamAccountType`, `PamResourceRole`, `PamProductRole`, `PamSessionStatus`, `PamAccessMethod`), permission helpers (`pam-permission.ts`), validators (`pam-validators.ts`), the policy registry (`pam-policies.ts`), and this CLAUDE.md |
| `pam-folder/` | Folder CRUD, folder-level permission checks |
| `pam-account/` | Account CRUD, credential encryption, gateway attachment, SSH CA management |
| `pam-account-template/` | Account templates (type + policies + settings), template config schemas (`pam-account-template-schemas.ts`); policy values live in the `policies` column, see [Policies](#policies) |
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
| Get access capabilities | Product membership (returns `isProductAdmin` / `isResourceAdmin` / `canViewSessions` / `canViewAuditLogs` flags for sidebar gating) |
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
| View audit logs | `ViewAuditLogs` per resource for account/folder logs; Product Admin for resource-less (product-level) logs |

### Audit Log Scoping

PAM audit logs are served through the shared `GET /organization/audit-logs` endpoint, but scoped by the PAM permission model rather than the generic project `AuditLogs` permission. `pamAuditLogScopeResolverFactory` (`pam/pam-audit-log-fns.ts`) is injected into `auditLogServiceFactory` as `resolvePamAuditScope`; for a PAM project it returns `{ accountIds, folderIds, includeProductLevel }` and the shared service skips its generic permission check and passes the scope to `auditLogDAL.find`. Returns `null` for non-PAM projects (generic check still applies).

Scoping rules (enforced via `eventMetadata` json): account-scoped logs (have `accountId`) and folder-scoped logs (have `folderId`) are returned only when the actor has `ViewAuditLogs` on that resource — a folder grant cascades to the accounts inside it. Resource-less logs (neither id, e.g. template/product-member events) are returned only to product admins. Admins are **not** exempt from the resource check. The scope filter is implemented in both audit-log backends (Postgres `auditLogDAL` and `clickhouseAuditLogDAL`), so it holds regardless of `CLICKHOUSE_AUDIT_LOG_ENABLED`.

**Requirement for new PAM events:** any account- or folder-scoped audit event must put `accountId`/`folderId` in its `eventMetadata`, or it falls into the product-level bucket and is hidden from resource viewers.

### Auth Modes

All PAM endpoints use `AuthMode.JWT` only (user access). `IDENTITY_ACCESS_TOKEN` is not supported. Gateway-facing endpoints (chunk upload, session credentials) use `AuthMode.GATEWAY_ACCESS_TOKEN`.

### Roles

- **Product roles** (`PamProductRole`): `Admin`, `Member`
- **Resource roles** (`PamResourceRole`): `Admin`, `Requester`, `Auditor`, `Connector`

Resource memberships are scoped to either a `PamFolder` or a `PamAccount` via the generic membership system (`ResourceType.PamFolder` / `ResourceType.PamAccount`).

## Account Types

Defined in `pam/pam-enums.ts` as `PamAccountType`. Each type's full config lives in `pam-account/pam-account-schemas.ts` in the `ACCOUNT_TYPE_CONFIGS` map. A config entry holds everything the backend and frontend need for that type:

- `name` -- human-readable label (e.g. `"PostgreSQL"`), served to the frontend
- `icon` -- icon filename under the frontend's account-platform icons (e.g. `"Postgres.png"`)
- `connectionDetails` -- Zod schema for the non-secret connection fields
- `credentials` -- Zod schema for the secret credentials (a `ZodObject` or a `ZodDiscriminatedUnion`)
- `sanitizedCredentials` -- Zod allowlist of credential fields that are safe to return in API responses (e.g. `username` but never `password`). This is the single source of truth for what's a secret -- there is no string-matching denylist.
- `ui` -- optional sparse per-field hints (`{ label?, widget?, secret? }`) for fields whose label/widget can't be inferred from the schema. Anything not listed is inferred.

### Schema-Driven Forms

The frontend renders the create/edit account forms entirely from backend metadata -- there are **no per-type frontend components**. `buildPamAccountTypeMetadata(webAccessSupportedTypes)` walks each config's Zod schemas and emits `PamFieldDescriptor`s (`{ key, label, widget, required, secret, options?, defaultValue?, showWhen? }`). The `GET /pam/accounts/types` endpoint serves these as `PamAccountTypeMetadata` (`{ type, name, icon, supportsWebAccess, connectionFields, credentialFields }`). `supportsWebAccess` is derived from the `SESSION_HANDLERS` keys (passed in by the route) -- the single source of truth for browser-session support -- so the frontend gates Browser vs CLI launch without a separate list to maintain.

How descriptors are derived:
- **Label** -- `ui[key].label`, else humanized from the field key.
- **Widget** -- `ui[key].widget`, else inferred from the Zod base type (`ZodNumber` -> `number`, `ZodBoolean` -> `boolean`, `ZodEnum` -> `select` with `options`, else `text`). `password`/`textarea` must be set via `ui` since they're not inferable.
- **Required** -- a field is optional if its schema is `ZodOptional`/`ZodDefault`/nullable (the builder peels these via `unwrapField`).
- **Secret** -- `ui[key].secret`, else `true` when the widget is `password`. Secret fields use the write-only `PamPasswordInput` (sentinel-based, see below).
- **Discriminated unions** (e.g. SSH `authMethod`) -- the discriminator becomes a `select`; each variant's non-shared fields get a `showWhen: { field, equals }` so the renderer reveals them conditionally.

### Key Helpers

- **`extractGatewayTarget(accountType, rawConnectionDetails)`** -- validated extraction of `{ host, port }` from decrypted connection details, dispatched by account type. Use this instead of raw type casts.
- **`sanitizeCredentials(accountType, decrypted)`** -- strips secret fields from decrypted credentials using the type's `sanitizedCredentials` allowlist; used by `getById` before returning credentials to the client.
- **`buildPamAccountTypeMetadata()`** -- builds the field descriptors served by `GET /pam/accounts/types`.
- **`PamAccessMethod`** enum (`Web`, `Cli`) -- use instead of hardcoded `"web"`/`"cli"` strings.

### Adding a New Account Type

Most types need only backend changes -- the frontend auto-renders from metadata.

1. Add the enum value to `PamAccountType` in `pam/pam-enums.ts` (and the matching frontend enum in `frontend/src/hooks/api/pam/enums.ts` -- the one shared string both sides need).
2. Add a config entry to `ACCOUNT_TYPE_CONFIGS` in `pam-account/pam-account-schemas.ts`: `name`, `icon`, `connectionDetails`, `credentials`, `sanitizedCredentials`, and any `ui` hints (set `widget: "password"`/`"textarea"` and `secret: true` where the schema can't express it).
3. Drop the icon image into `frontend/public/images/integrations/` matching the `icon` filename in the config. No component edit -- `AccountPlatformIcon` and the type pickers resolve the name/icon from `GET /pam/accounts/types`.
4. Add a case to `extractGatewayTarget` in `pam-account-schemas.ts`.
5. If it supports web access: add a session handler in `pam-web-access/` (export the handler function) and add an entry for it to the `SESSION_HANDLERS` map in `pam-session-handlers.ts`.

No changes to the account form components, router schemas, or field renderers are needed. The per-type route bodies use `config.connectionDetails`/`config.credentials` directly, the detail response (`SanitizedAccountDetailSchema`) is a discriminated union auto-derived from `ACCOUNT_TYPE_CONFIGS` (each variant pulls `connectionDetails` and `sanitizedCredentials` from the config), and the frontend forms render from `GET /pam/accounts/types`.

## Policies

Policies are the governance controls applied to a template (require MFA, require reason, max session duration). They are registry-driven, defined once in `PAM_POLICY_DEFINITIONS` in `pam/pam-policies.ts`, keyed by `PamPolicyType`. Each entry is `{ label, description, appliesTo, schema }` where `appliesTo` is an account-type list or `"all"`, and `schema` is the Zod schema for that policy's value (a primitive or object).

"Access policy" is the category, not a type: MFA, reason, and duration are individual peer policies that each `appliesTo: "all"`. `appliesTo` can also be a list to scope a policy to specific account types. This is distinct from **settings** (recording, password constraints), which are NOT policies, they live in the template's separate `settings` column with their own schema and bespoke UI.

Storage: a template's `policies` jsonb column is a flat map keyed by `PamPolicyType`, e.g. `{ "require-mfa": true, "max-session-duration": 3600 }`. No DB defaults and no per-policy migration: absence resolves to the policy's natural default in the resolver (a missing boolean is `false`, a missing duration falls back to `DEFAULT_SESSION_DURATION_MS`).

A registry entry flows automatically to:
- **`GET /pam/accounts/types`** (`applicablePolicies`), so the frontend renders the right editors per account type with no per-type wiring.
- **`validatePolicyValues`**, used by template create/update to reject policies that don't apply to the type or fail their schema (returns a result object; the caller maps `ok: false` to a `BadRequestError`).

Policies are either server-enforced or gateway-enforced:
- **Server-enforced** (MFA, reason, duration): `resolveAccessControls` reads the values and they're applied in `pam-session`/`pam-web-access` before the session starts.
- **Gateway-enforced** (command blocking): the value is read via `resolvePolicy` in `getSessionCredentials` and included in the `policyRules` response. The gateway compiles the patterns and enforces them during the session.

Command blocking (`PamPolicyType.CommandBlocking`) is the first gateway-enforced policy. It applies only to SSH (`appliesTo: [PamAccountType.SSH]`). Stored as a newline-separated string of regex patterns, split into an array at the credentials endpoint before sending to the gateway.

Session log masking (`sessionLogMaskingPatterns`) is a **setting**, not a policy. It lives in `PamTemplateSettingsSchema` and is read from `account.templateSettings` in `getSessionCredentials`. It also flows to the gateway via the `policyRules` response alongside command blocking patterns.

### Adding a New Policy

1. Add the value to `PamPolicyType` and an entry to `PAM_POLICY_DEFINITIONS` in `pam/pam-policies.ts` (`label`, `description`, `appliesTo`, `schema`). Mirror the enum value in `frontend/src/hooks/api/pam/enums.ts`.
2. Register the policy in `POLICY_EDITORS` (`frontend/src/pages/pam/components/policyEditors/`), keyed by the new `PamPolicyType`. Reuse an existing editor when the value shape matches (`BooleanPolicyEditor` for a `z.boolean()`, `DurationPolicyEditor` for a number); only write a new editor component for a novel value shape. Each editor receives `{ label, description, value, onChange }` and owns its own layout, booleans render inline, others vertical.
3. Enforcement: read it where it's enforced. A server-enforced policy extends `resolveAccessControls` and is applied in `pam-session`/`pam-web-access`. A gateway-enforced policy is read via `resolvePolicy` in `getSessionCredentials`, split/transformed as needed, and included in the `policyRules` response (see command blocking for the pattern). Both the service return and the router response schema must be updated atomically -- Fastify's Zod serializer strips unknown keys.

No migration, no router or response-schema change (beyond `policyRules` for gateway-enforced policies), and no DB default.

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
