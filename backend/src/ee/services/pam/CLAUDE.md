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
| `pam-access-request/` | Folder approval configuration and access request lifecycle (built on the generic `approval-policy` engine), plus folder-level chat notification configs (`pam-folder-notification-config-dal.ts`, pure filtering helpers in `pam-access-request-fns.ts`) |
| `pam-web-access/` | WebSocket session handlers (Postgres, SSH, RDP), ticket-based auth |

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
| Launch session / web access | `LaunchSessions` always. Gated account (`requiresApproval`): `LaunchSessions` AND a valid approval grant, enforced in both `pam-session-service.access()` and `pam-web-access-service.issueWebSocketTicket()`. Approval is a layer on top of standing access, never a substitute for it. |
| View recording | `ViewSessions` (via `checkAccountAccess`) |
| Revoke access grant | `RevokeGrants` on the grant's account (via `checkAccountAccess`) |
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

PAM endpoints accept both `AuthMode.JWT` and `AuthMode.IDENTITY_ACCESS_TOKEN`, except session launch and web-access which are JWT-only. Gateway-facing endpoints (chunk upload, session credentials) use `AuthMode.GATEWAY_ACCESS_TOKEN`.

### Roles

- **Product roles** (`PamProductRole`): `Admin`, `Member`
- **Resource roles** (`PamResourceRole`): `Admin`, `Connector`, `Auditor`. `Connector` grants `ReadFolder` + `ReadAccounts` + `LaunchSessions` (direct launch on non-gated accounts; on gated ones `LaunchSessions` also authorizes submitting an access request, since there is no dedicated request permission).

Resource memberships are scoped to either a `PamFolder` or a `PamAccount` via the generic membership system (`ResourceType.PamFolder` / `ResourceType.PamAccount`).

## Consolidated Project & Lazy Bootstrap

There is exactly one PAM project (`ProjectType.PAM`) per org, holding all folders, accounts, templates, and memberships. New orgs get it eagerly at creation time. Orgs that had no PAM data at migration time get **no** project up front; it is created lazily on first PAM access. Code lives in `pam-project/`.

- **`pamProjectResolverFactory` (`pam-project-resolver.ts`)** -- `resolve(orgId)` returns the project id, creating it on first use. It is wrapped in `withCache` (Redis, `KeyStorePrefixes.PamDefaultProject`, `PamDefaultProjectInSeconds` TTL); on a miss it calls `findDefaultProjectId` (newest `type=pam` project via `projectDAL.find`, already excludes soft-deleted) and falls back to `ensureDefaultProject`.
- **`ensureDefaultProject`** serializes concurrent first-use bootstraps for an org with `SELECT pg_advisory_xact_lock(hashtext('pam-bootstrap:' || orgId))` inside a transaction, then **re-checks** `findDefaultProjectId(orgId, tx)` on the primary before creating. There is no DB unique constraint to lean on because old zombie PAM projects also have `type=pam`, so an org can legitimately have several rows; the lock + in-lock re-check is what prevents duplicates and picks the consolidated one. The lock auto-releases at transaction end.
- **Admin seeding:** the bootstrap seeds the org's current admins (users, identities, and groups with a non-temporary org `admin` role) as PAM **project** admins. This is required because the PAM permission model has **no org-admin fallback** (`getProjectPermission` needs project-scoped membership) -- without seeding, no one could administer the freshly-created project.
- **`bootstrapPamProject` (`pam-project-bootstrap.ts`)** creates the project, the `DEFAULT_ACCOUNT_TEMPLATES` (11 of them), and the admin memberships. It takes `adminUserIds` / `adminIdentityIds` / `adminGroupIds`; the migration and sub-org creation call it directly, the resolver derives those lists from current org admins.
- **Request wiring:** the `injectPamProjectId` preValidation hook (on all `/api/v1/pam/*` routes) calls `resolve(actorOrgId)` and sets `req.internalPamProjectId`, so by the time any PAM handler runs the project exists. `GET /api/v1/pam/project` just returns that id -- the frontend hits it to trigger the lazy create for an org whose `getOrgById.pamProjectId` came back null, then seeds the id into its org cache.
- **`getOrgById` derivation:** `pamProjectId` in the org DTO is derived from the newest `type=pam` project (nullable), it is **not** a stored column and is not resolved/bootstrapped there (keeps the read a pure query).

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

- **`extractGatewayTarget(accountType, rawConnectionDetails)`** -- validated extraction of `{ host, port }` from decrypted connection details, dispatched by account type. Used to set the cert routing extension (`getPAMConnectionDetails`) and the session's `selectedHost`. Use this instead of raw type casts.
- **`buildSessionGatewayConnectionDetails(accountType, rawConnectionDetails, selectedHost?)`** -- reshapes decrypted connection details into the blob the gateway reads for a live session (returned from `getSessionCredentials`). Most types pass through their validated connection details unchanged. Windows AD is the exception: it is brokered through the **Windows** RDP gateway protocol (`gatewayAccountType: Windows`), so it must be reduced to the Windows shape `{ host, port }` -- `host` is the `selectedHost` (the chosen entry from the account's `hosts` list) and `port` is `rdpPort`. The AD-only fields (FQDN/`domain`, `dcAddress`, the LDAP `port`, ldap settings) are intentionally **not** forwarded: they are not part of the RDP leg, and a stray `domain` alongside a `DOMAIN\username` credential makes the gateway's NLA credential resolution ambiguous and fails the session. Domain login is carried by the `DOMAIN\username` credential format (mirrors how `main`'s domain accounts brokered RDP through the Windows resource's `{ host, port }`). When adding a type that reuses another type's gateway protocol, reshape it here.
- **`getSelectableHosts(accountType, rawConnectionDetails)`** / **`resolveSelectedHost(accountType, rawConnectionDetails, requestedHost?)`** -- host-selection support for account types that hold a host list (Windows AD). `getSelectableHosts` returns the candidate hosts (or `null` for single-host types); `resolveSelectedHost` validates a launcher-requested host against that allow-list and returns the host to connect to (falling back to the first). The web-access ticket (`issueWebSocketTicket`) resolves the host **at issuance** and bakes it into the signed ticket payload, so the WS connection can't target an arbitrary host. The frontend `RdpLauncher` prompts for the host when there's more than one.
- **`sanitizeCredentials(accountType, decrypted)`** -- strips secret fields from decrypted credentials using the type's `sanitizedCredentials` allowlist; used by `getById` before returning credentials to the client.
- **`buildPamAccountTypeMetadata()`** -- builds the field descriptors served by `GET /pam/accounts/types`.
- **`PamAccessMethod`** enum (`Web`, `Cli`) -- use instead of hardcoded `"web"`/`"cli"` strings.

### Adding a New Account Type

Most types need only backend changes -- the frontend auto-renders from metadata.

1. Add the enum value to `PamAccountType` in `pam/pam-enums.ts` (and the matching frontend enum in `frontend/src/hooks/api/pam/enums.ts` -- the one shared string both sides need).
2. Add a config entry to `ACCOUNT_TYPE_CONFIGS` in `pam-account/pam-account-schemas.ts`: `name`, `icon`, `connectionDetails`, `credentials`, `sanitizedCredentials`, and any `ui` hints (set `widget: "password"`/`"textarea"` and `secret: true` where the schema can't express it).
3. Drop the icon image into `frontend/public/images/integrations/` matching the `icon` filename in the config. No component edit -- `AccountPlatformIcon` and the type pickers resolve the name/icon from `GET /pam/accounts/types`.
4. Add a case to `extractGatewayTarget` in `pam-account-schemas.ts`.
5. If it supports web access: add a session handler in `pam-web-access/` (export the handler function) and add an entry for it to the `SESSION_HANDLERS` map in `pam-session-handlers.ts`. If the entry reuses another type's `gatewayAccountType` (e.g. Windows AD → `Windows` for RDP), add a case to `buildSessionGatewayConnectionDetails` so the session credentials blob matches the shape that gateway protocol expects.

No changes to the account form components, router schemas, or field renderers are needed. The per-type route bodies use `config.connectionDetails`/`config.credentials` directly, the detail response (`SanitizedAccountDetailSchema`) is a discriminated union auto-derived from `ACCOUNT_TYPE_CONFIGS` (each variant pulls `connectionDetails` and `sanitizedCredentials` from the config), and the frontend forms render from `GET /pam/accounts/types`.

## Policies

Policies are the governance controls applied to a template (require MFA, require reason, max session duration). They are registry-driven, defined once in `PAM_POLICY_DEFINITIONS` in `pam/pam-policies.ts`, keyed by `PamPolicyType`. Each entry is `{ label, description, appliesTo, schema }` where `appliesTo` is an account-type list or `"all"`, and `schema` is the Zod schema for that policy's value (a primitive or object).

"Access policy" is the category, not a type: MFA, reason, and duration are individual peer policies that each `appliesTo: "all"`. `appliesTo` can also be a list to scope a policy to specific account types. This is distinct from **settings** (recording, password constraints), which are NOT policies, they live in the template's separate `settings` column with their own schema and bespoke UI.

In the template detail sheet (`frontend/src/pages/pam/PamTemplatesPage/components/TemplateDetailSheet.tsx`), the **"General"** tab is for policies and system settings (gateway, session recording / storage backend, and similar template-level defaults); the **"Configuration"** tab is only for generic template metadata like name and description. When adding a new policy or setting, it belongs on the General tab, not Configuration.

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

## Approval Chat Notifications (Slack)

Folder-level, not project-level: each folder's Approvals tab can attach org `workflow_integrations` (Slack only for now) with channels and subscribed events, stored in `pam_folder_notification_configs` (`channels` and `events` are jsonb; channel objects are `{ id, name }` so the UI renders names without needing the org-gated Slack channel-list API). This intentionally does NOT use `project_slack_configs` or `triggerWorkflowIntegrationNotification`, which resolve config by projectId (the single PAM project would make the config org-wide).

Flow: `createRequest` and `reviewRequest` in `pam-access-request-service.ts` call `triggerFolderSlackNotifications`, which filters configs via the pure `getSlackSendTargets` (`pam-access-request-fns.ts`, unit-tested) and sends through the shared `sendSlackNotification` (`services/slack/slack-fns.ts`). Events are `PamNotificationEvent` in `pam/pam-enums.ts` (mirrored in the frontend enums file). New `TriggerFeature.PAM_*` variants carry the payloads; their Slack templates live in `buildSlackPayload`. All sends are fire-and-forget (never fail the request flow). Config writes ride the existing PUT approval-configuration endpoint (undefined `notificationConfigs` leaves configs unchanged; empty array deletes all). Microsoft Teams can be added later by branching on `integration` in the trigger helper, the table needs no change.

## Credential Rotation

Scheduled + on-demand rotation of a SQL account's password. Scoped to Postgres, MySQL, MSSQL. Lives in `pam-account-rotation/`.

- **Config on the template** (`settings.rotation = { enabled, intervalSeconds }` + `settings.passwordRequirements`, reusing `secret-rotation-v2`'s `PasswordRequirementsSchema` and `generatePassword`). Accounts inherit it; only the `rotationAccountId` is per-account. `validateTemplateRotationConfig` rejects rotation config on non-SQL types and rejects `' " \ ` `` ` `` `; ?` in `allowedSymbols` (the ALTER statement interpolates the password and runs via knex `.raw`).
- **`rotationAccountId` (on `pam_accounts`)**: null = not configured (not scheduled); own id = self-rotation; another account = delegated. `ON DELETE RESTRICT` (deleting an account referenced as a rotation account is blocked). Server-specific, so it never moves to the template.
- **Handler registry** `PAM_ROTATION_FACTORY_MAP` (`pam-rotation-handlers.ts`): all three SQL types share `sqlRotationHandler` (`applyPasswordChange` + `testCredential`). Adding a SQL dialect = add it to `ROTATABLE_ACCOUNT_TYPES` and `PAM_ROTATION_APP_MAP` (both in `pam-rotation-fns.ts`); both are full `Record`s over the rotatable types, so a missing entry is a compile error. All per-dialect SQL facts (client, ALTER statement, verify query, SSL/connection config) live once in `app-connection/shared/sql` keyed by `AppConnection` (`SQL_CONNECTION_CLIENT_MAP`, `SQL_CONNECTION_ALTER_LOGIN_STATEMENT`, `getSqlConnectionVerifyQuery`, `getConnectionConfig`) and the handler reads them via `PAM_ROTATION_APP_MAP`, so a new dialect already handled there (e.g. Oracle with `SELECT 1 FROM DUAL`) needs no rotation-side change beyond the two maps. SQL is brokered through the gateway via `withPamSqlClient` (mirrors `executeWithPotentialGateway`; the direct-connect path runs the same `verifyHostInputValidity` SSRF guard).
- **Readiness + schedule** are pure fns in `pam-rotation-fns.ts` (`getRotationReadiness`, `computeNextRotationAt`). The account-level "will rotate" predicate is `ACCOUNT_WILL_ROTATE_SQL` / `ACCOUNT_NEEDS_ROTATION_ACCOUNT_SQL` (same file), shared by both set-based SQL paths (`reconcileRotationScheduleForTemplate`, `getTemplateRotationStats`); `getRotationReadiness` is the row-at-a-time TS mirror. `nextRotationAt` is set/cleared by `reconcileRotationScheduleForTemplate` (bulk, on template update), `reconcileRotationScheduleForAccount` (on account create/update, set rotation account), and on a failed rotation by `recordRotationFailure` (capped retry). Never schedule elsewhere.
- **Execution** (`pam-account-rotation-service.ts` `performRotation`): per-account Redis lock (`KeyStorePrefixes.PamAccountRotationLock`), then stage `encryptedPendingCredentials` → apply → verify → promote, with a recovery probe (candidate-then-current, both through the gateway) that never discards a possibly-live credential. Every failure path (including guards that throw before staging) funnels through one `recordRotationFailure` in `performRotation`'s catch, which records the redacted message and advances `nextRotationAt` by `min(interval, ROTATION_FAILURE_RETRY_CAP_SECONDS)` so a failure never hot-loops the cron and a transient outage retries well before a long interval elapses.
- **Scheduling**: cron `PamCredentialRotationQueueRotations` → dispatcher queue `PamCredentialRotation` → per-account worker `PamCredentialRotationRotate` (concurrency + limiter). New queue names deliberately avoid the stale `pam-account-rotation`.
- **Audit**: manual rotation audits in the route (`PAM_ACCOUNT_ROTATE_CREDENTIALS`, user actor); scheduled rotation audits in the queue worker (platform actor). Both carry `accountId` (required for PAM audit scoping).

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

`resourceId`, `domainId`, `policyId`, `requireMfa`, `internalMetadata`, `discoveryFingerprint`

> `lastRotatedAt`, `rotationStatus`, and `encryptedLastRotationMessage` are **no longer dropped**: the credential-rotation feature (`pam-account-rotation/`) reuses them for the latest rotation state and error.

### Columns to drop from `pam_sessions`

`resourceName`, `resourceId`, `selectedResourceId`, `encryptedAiInsights`, `aiInsightsStatus`, `aiInsightsError`, `encryptedLogsBlob`

## DI Wiring

All PAM factories are wired in `backend/src/server/routes/index.ts`. When adding a new dependency to a PAM service, update the wiring there and narrow the type with `Pick<>` in the service's dependency type.
