# PAM Backend — CLAUDE.md

## Maintaining this file

This is a **high-level map** of the PAM backend, not a spec. Keep entries to concepts, where things
live, and non-obvious invariants an agent would otherwise get wrong. Do **not** document line-by-line
mechanics, function signatures, or field lists — the code is the source of truth for those, and an agent
can read the relevant file. When you add a feature, add at most a few lines here (or a row to the module
table) and let the code carry the detail.

## Module Layout

All PAM services live under `backend/src/ee/services/pam-*/`:

| Directory | Purpose |
|---|---|
| `pam/` | Shared enums, permission helpers (`pam-permission.ts`), validators, policy registry (`pam-policies.ts`), and this file |
| `pam-folder/` | Folder CRUD + folder-level permission checks |
| `pam-account/` | Account CRUD, credential encryption, gateway attachment, SSH CA, account-type config |
| `pam-account-template/` | Account templates (type + policies + settings) |
| `pam-account-rotation/` | Scheduled + on-demand SQL credential rotation |
| `pam-session/` + `pam-web-access/` | Session lifecycle and WebSocket session handlers (Postgres/SSH/RDP) |
| `pam-session-recording/` | Recording chunk storage/retrieval + storage providers |
| `pam-membership/` | Product + resource membership management |
| `pam-project/` | PAM project bootstrap + resolver |
| `pam-access-request/` | Folder approval config, access-request lifecycle, chat notifications |
| `pam-discovery/` | Discovery sources → staged accounts for import |

Routes: `backend/src/ee/routes/v1/pam-routers/`. DI wiring: `backend/src/server/routes/index.ts` (narrow
new deps with `Pick<>`).

## Permissions

Two tiers: **product membership** (`PamProductRole`: Admin/Member) + **resource membership** scoped to a
folder or account (`PamResourceRole`: Admin/Connector/Auditor). Shared helpers live in
`pam/pam-permission.ts` (`verifyProductMembership`, `checkAccountAccess`, `getResourceIdsWithActions`, …) —
use them instead of re-implementing. Every list/mutation endpoint checks an **action**, not just
membership. There is **no org-admin fallback**: permission needs project-scoped membership.

Gotchas:
- **Audit logs** are served through the shared org audit-log endpoint but scoped by the PAM model
  (`pam/pam-audit-log-fns.ts`), not the generic project `AuditLogs` permission. Any new account- or
  folder-scoped event **must** put `accountId`/`folderId` in its `eventMetadata`, or it lands in the
  product-level bucket and is hidden from resource viewers.
- Gated accounts (`requiresApproval`) require `LaunchSessions` **and** a valid approval grant, enforced in
  both the session and web-access services.
- PAM endpoints accept JWT + identity tokens; session launch/web-access are JWT-only; gateway-facing
  endpoints use `AuthMode.GATEWAY_ACCESS_TOKEN`.

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

## Credential Rotation

`pam-account-rotation/`: scheduled + on-demand SQL password rotation (Postgres/MySQL/MSSQL). Rotation
config lives on the template; `rotationAccountId` (self or delegated) is per-account. Per-dialect SQL facts
are reused from `app-connection/shared/sql`, and rotation is brokered through the gateway.

## Sessions

`pam-session/` + `pam-web-access/`. Sessions reference accounts via nullable `accountId` (history survives
account deletion; orphaned sessions are hidden from all queries). Duration is capped at the template max;
expiration is enforced by a delayed BullMQ job scheduled at session creation.

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
