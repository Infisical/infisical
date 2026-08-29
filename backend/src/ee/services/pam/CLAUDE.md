# PAM Backend — CLAUDE.md

## Maintaining this file

This is a **high-level map** of the PAM backend, not a spec. Keep entries to concepts, where things
live, and non-obvious invariants an agent would otherwise get wrong. Do **not** document line-by-line
mechanics, function signatures, or field lists — the code is the source of truth for those, and an agent
can read the relevant file. When you add a feature, add at most a few lines here (or a row to the module
table) and let the code carry the detail.

## Module Layout

All PAM services live under `backend/src/ee/services/pam-*/`:

| Directory                          | Purpose                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pam/`                             | Shared enums, permission helpers (`pam-permission.ts`), validators, policy registry (`pam-policies.ts`), and this file |
| `pam-folder/`                      | Folder CRUD + folder-level permission checks                                                                           |
| `pam-account/`                     | Account CRUD, credential encryption, gateway attachment, SSH CA, account-type config                                   |
| `pam-account-template/`            | Account templates (type + policies + settings)                                                                         |
| `pam-account-rotation/`            | Scheduled + on-demand SQL credential rotation                                                                          |
| `pam-session/` + `pam-web-access/` | Session lifecycle and WebSocket session handlers (Postgres/SSH/RDP)                                                    |
| `pam-session-recording/`           | Recording chunk storage/retrieval + storage providers                                                                  |
| `pam-membership/`                  | Product + resource membership management                                                                               |
| `pam-project/`                     | PAM project bootstrap + resolver                                                                                       |
| `pam-access-request/`              | Folder approval config, access-request lifecycle, chat notifications                                                   |
| `pam-discovery/`                   | Discovery sources → staged accounts for import                                                                         |

Routes: `backend/src/ee/routes/v1/pam-routers/`. DI wiring: `backend/src/server/routes/index.ts` (narrow
new deps with `Pick<>`).

## Permissions

Two tiers: **product membership** (`PamProductRole`: Admin/Member) + **resource membership** scoped to a
folder or account (`PamResourceRole`: Admin/Operator/Connector/Auditor; Operator is Connector plus
`ViewCredentials`, with no approval rights so credential approval can't be self-served). Shared helpers live in
`pam/pam-permission.ts` (`verifyProductMembership`, `checkAccountAccess`, `getResourceIdsWithActions`, …) —
use them instead of re-implementing. Every list/mutation endpoint checks an **action**, not just
membership. There is **no org-admin fallback**: permission needs project-scoped membership.

Gotchas:

- **Product membership is plain project membership, so PAM roles inherit the generic project role rules.**
  `PamProductRole.Admin`/`Member` are stored as the `admin`/`member` project membership roles, which means a
  product member would otherwise pick up the generic project Member ability — including identity CRUD.
  In a PAM project those slugs resolve to their own rule sets — `pamProjectAdminPermissions` /
  `pamProjectMemberPermissions` in `permission/default-roles.ts`, dispatched by project type in
  `buildProjectPermissionRules` — rather than the generic project Admin/Member abilities. A product
  member gets read-only visibility of members, groups and identities and nothing else, because
  everything they are entitled to comes from their folder/account memberships. Managing identities,
  users and groups is a product admin responsibility; without the split, a product member inherited
  identity create/edit and could attach an auth method to a product admin identity and log in with its
  PAM access. Anything that is not `admin` (including `custom`, which is also how additional privileges
  arrive) resolves to the member set, so a custom role cannot reintroduce project-level power in PAM.
  `getProjectPermissionByRoles` resolves the project type too, so the privilege-boundary comparison
  measures a product admin against the PAM rule sets and not the generic ones.
- **Audit logs** are served through the shared org audit-log endpoint but scoped by the PAM model
  (`pam/pam-audit-log-fns.ts`), not the generic project `AuditLogs` permission. Any new account- or
  folder-scoped event **must** put `accountId`/`folderId` in its `eventMetadata`, or it lands in the
  product-level bucket and is hidden from resource viewers.
- Gated accounts (`requiresApproval`) require `LaunchSessions` **and** a valid approval grant, enforced in
  both the session and web-access services.
- **Session launch and credential reveal (`pamAccountService.getCredentials`) are independent gates over
  one folder policy.** `requiresApproval` / `requiresCredentialApproval` turn them on; both use the same
  `PamAccess` policy and approvers, told apart by `accessType` on the request data and grant attributes.
  **A missing `accessType` means session**, so a grant predating credential access can never unlock a
  reveal — never treat it as a wildcard. Hence `checkGrant`/`getAccessStatusBatch` take an `accessType`,
  pending requests dedupe per (account, accessType), and `revokeGrantRow` skips session termination for a
  credential grant.
- PAM endpoints accept JWT + identity tokens, including CLI session launch (`POST /pam/sessions/access`)
  and raising access requests (`POST /pam/access-requests`); web access stays JWT-only, as does
  reviewing/revoking (identities are never approvers). MFA-gated accounts still reject machine actors,
  since no machine can satisfy an OTP. Gateway-facing endpoints use `AuthMode.GATEWAY_ACCESS_TOKEN`.
- **Actor columns come in pairs, and every lookup must filter the right one.** Sessions use
  `userId`/`identityId`, approval requests `requesterId`/`machineIdentityId`, grants
  `granteeUserId`/`granteeMachineIdentityId` — exactly one is set per row. `pam-access-request-service.ts`
  centralizes this in `actorRequestFilter` / `actorGrantFilter`; use them instead of hardcoding a column,
  or a machine identity silently reads another actor's rows (or none at all).

## PAM Project (consolidated + lazy)

Exactly one `ProjectType.PAM` project per org holds all folders, accounts, templates, and memberships
(`pam-project/`). New orgs get it eagerly; migrated orgs create it lazily on first PAM access. Bootstrap
seeds the org's current admins as project admins — required, because of the no-org-admin-fallback rule
above. The `injectPamProjectId` hook resolves it before any PAM handler runs.

## Account Types

Each type's full config (connection/credential schemas, icon, label, sanitized-credential allowlist) lives
in one `ACCOUNT_TYPE_CONFIGS` entry in `pam-account/pam-account-schemas.ts`. Forms are **schema-driven**:
the frontend renders create/edit forms from `GET /pam/accounts/types` metadata, so there are **no per-type
frontend components**. Adding a type is mostly a config entry + an icon; the gateway extension points are
`extractGatewayTarget` and `buildSessionGatewayConnectionDetails` in the same file.

**Auth methods** are a discriminated union on `credentials`. `forceWhen` (a UI hint, applied server-side
by `applyForcedFields` on create/update and mirrored by the form) pins fields an auth method leaves no
choice about; its condition may cross field groups (`credentials.authMethod` from a connection field).
TLS trust stays where it is for every other database account: the operator supplies `sslCertificate`,
and Infisical ships no CA material.

Postgres AWS IAM auth mints an RDS token backend-side (`generateRdsAuthToken`) and hands it to the
gateway as the password, so the gateway is unchanged and the role trust model matches every other AWS
integration (Infisical assumes it, External ID = org ID). The token lives 15 minutes while sessions run
longer, so the gateway caps its credential cache for postgres and re-fetches (`pam-proxy.go`).

**Adding an auth method to an existing type is a compatibility event.** Stored credentials (and API
callers) predating the discriminator carry none, which a `z.discriminatedUnion` rejects outright, so the
union goes through `withLegacyAuthMethod` and every path that reads the blob without re-parsing goes
through `normalizeCredentialAuthMethod`. The rotation cron validates the stored blob on every run, so
skipping this breaks rotation for every existing account of that type, not just edits.

Postgres AWS IAM auth is the reference implementation: the **gateway** mints the RDS token per connection
from its own AWS identity (`packages/pam/aws_rds_auth.go`), so no secret is stored, none crosses the wire,
and the 15-minute token lifetime never collides with session duration.

**Connection test** (`assertConnectionOk`) runs inside account `create`/`update` and **throws to block the write**
if the target can't be reached/authenticated. Per-type behaviour lives in `pam-account-connection-test.ts`:
`buildGatewayConnectionTest` resolves the gateway target + a `mode`-tagged request, and `CLOUD_CONNECTION_VALIDATORS`
handles the host-less cloud accounts (AWS/GCP/Azure) by minting credentials backend-side via the federation helpers.
Gateway-routed types run through one RPC — `testConnectionWithGateway` → the gateway's `/v1/test-connection` handler
(`packages/gateway-v2/test_connection_handler.go`), dispatched on `mode`: `sql` (postgres/mysql/mssql auth), `mongodb`,
`ldap` (Windows AD, against `dcAddress`), `kubernetes` (token), `ssh`, or `tcp` (reachability — the ceiling for
Windows RDP, SSH cert auth, MsSQL NTLM/Kerberos, and K8s gateway-auth). A null test result (gateway offline / missing
the connection-test protocol) skips rather than blocks.

Cloud types use one of two brokering models instead of a plain gateway TCP proxy: **gateway-less** (`AwsIam`,
`requiresGateway: false`) mints short-lived STS credentials in `access()` and returns them in session
metadata; **gateway-injection** (`GcpServiceAccount`, `AzureCli`) proxies the cloud REST API through the
gateway and injects a backend-minted short-lived token so no credential reaches the client. See
`access()` / `getSessionCredentials` and the CLI `packages/pam/handlers/<provider>`.

## Policies & Settings

**Policies** are governance controls on a template (MFA, reason, session duration, command-blocking),
registry-driven in `pam/pam-policies.ts` and stored in the template's `policies` jsonb. Server-enforced
policies apply before the session starts; gateway-enforced ones flow to the gateway via `policyRules`.
**Settings** (recording, password constraints, log masking) are a separate concept — they live in the
template's `settings` column, not `policies`. Both are edited on the template detail sheet's "General" tab.

## Discovery

`pam-discovery/`: a **source** (a credential account + gateway) scans and stages **discovered accounts**
for import into a folder. Type registry is `DISCOVERY_TYPE_CONFIGS`; providers return
`{ validateConnection, scan }` and never touch the DB — the service owns encryption, staging, and
fingerprint dedupe. Discovery runs everything **through the gateway** (SSH-exec / port-sweep / WinRM RPCs),
so `ssh2` is never used on the backend and scans produce no session rows, recordings, or session audits.
Current types: Active Directory and Unix.

**Staleness (Windows).** After a completed scan, discovered accounts it no longer finds are reconciled:
never-imported ones are deleted, imported ones are flagged stale (reappearing self-heals). Only accounts in a
re-checked scope are touched, so an unreachable host can't mass-flag (same guardrail as dependency pruning). A
managed account's staleness is derived from its discovered row (not stored on the account) and is **purely
informational** — it is deliberately *not* an accessibility issue and gates nothing: rotation (scheduled and
on-demand), session launch, web access, and import all behave exactly as they do for a non-stale account. The
only surfaces are `isStale` on the account and the source's Stale Accounts tab (`GET
/pam/discovery-sources/:sourceId/stale-accounts`), so an admin can decide whether to delete it. Don't add a
staleness check to a code path; if the target is really gone, the operation's own failure is the signal.

## Credential Rotation

`pam-account-rotation/`: scheduled + on-demand SQL password rotation (Postgres/MySQL/MSSQL). Rotation
config lives on the template; `rotationAccountId` (self or delegated) is per-account. Per-dialect SQL facts
are reused from `app-connection/shared/sql`, and rotation is brokered through the gateway.

## Sessions

`pam-session/` + `pam-web-access/`. Sessions reference accounts via nullable `accountId` (history survives
account deletion). Duration is capped at the template max; expiration is enforced by a delayed BullMQ job
scheduled at session creation.

**An orphaned session (null `accountId`) is scoped to product admin.** Every
resource-scoped predicate is false once the FK is nulled, so `PamProductRole.Admin` stands in on the
read/terminate paths (the DAL's `includeOrphaned`, `getSessionById`/`terminateSession`, recording
playback), as it does for scope-less audit-log rows. `getSessionCredentials` still refuses — no account
means no credentials to mint.

## Conventions

- **DAL**: reads use `db.replicaNode()`, writes hit primary, all methods take an optional `tx`.
- **Search**: filter both tiers — server-side via ormify's `$search` (ILIKE) and client-side on the
  immediate value for instant feedback. `PamSessionsPage` / `PamDiscoveryPage` are the references.

## Deferred Cleanup

Old tables/columns/code kept temporarily for rollback safety; target removal ~2026-08-01 via a follow-up
migration. Tracked items:

- **Legacy tables**: `pam_resources`, `pam_domains`, `pam_account_policies`,
  `pam_resource_rotation_rules`, `pam_resource_favorites`,
  `pam_project_recording_configs`, `pam_session_event_batches`.
  (`pam_account_dependencies` was **repurposed**, not dropped: it now backs dependency detection,
  keyed off `pam_accounts` / `pam_discovered_accounts` instead of the legacy `pam_resources`.)
- **`pam_accounts` columns**: `resourceId`, `domainId`, `policyId`, `requireMfa`, `internalMetadata`,
  `discoveryFingerprint`. (`lastRotatedAt`, `rotationStatus`, `encryptedLastRotationMessage` are **kept** —
  credential rotation reuses them.)
- **`pam_sessions` columns**: `resourceName`, `resourceId`, `selectedResourceId`, `encryptedAiInsights`,
  `aiInsightsStatus`, `aiInsightsError`, `encryptedLogsBlob`.
- **Stale Redis queue entries** in `queue-service.ts`: `pam-account-rotation`, `pam-session-ai-summary`,
  `pam-discovery-scan` (remove once all deployments have booted on the new code).
