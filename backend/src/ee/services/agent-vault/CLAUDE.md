# Agent Vault backend

Read this before touching any `agent-vault-*` service or router. It holds only what the code does not say on
its own: the invariants that are easy to break and the decisions that are settled. Add a line when a reader
would get something wrong from the code alone; cut anything the code already states.

**Thesis.** An agent runs holding no credentials. Its HTTP traffic goes through a proxy we control, which
attaches the real credential on the way out. What an agent may reach lives in a **session** row on our side,
never in anything the agent holds.

| Noun | What it is |
| --- | --- |
| **Access bundle** | A named set of services. The unit you grant |
| **Service** | One host pattern set plus its credential |
| **Session** | A minted token naming one actor, one of their bundles, and an expiry. The token *is* the session |
| **Proxy** | One deployed egress node with its own CA. One row per box |

```
agent-vault/                 shared: enums, host grammar, conflict detection, reachability
agent-vault-access-bundle/   bundles, services, credential encryption, grants
agent-vault-member/          product membership (list, add, role, remove)
agent-vault-session/         mint, revoke, list, retention sweep
agent-vault-project/         the per-org project's lazy bootstrap and resolver
agent-vault-proxy/           login (enrollment), heartbeat, resolve
agent-vault-activity/        storage settings, chunk ingest, playback
```

Routes: `ee/routes/v1/agent-vault-routers/`, prefix `/api/v1/agent-vault`. CLI: `packages/cmd/agent_vault*.go`
and `packages/agentvault/` in the CLI repo. Frontend: `frontend/src/pages/agent-vault/`,
`frontend/src/hooks/api/agentVault/`, `frontend/src/components/agent-vault/`.

## The project

- One implicit project per org, created lazily by the `injectAgentVaultProjectId` preValidation hook, so
  `GET /agent-vault/project` creates it on first access. That REST deviation is deliberate.
- Generic project create and delete are blocked for this type, and the project is excluded from
  `countOfBillableOrgProjects`. Break the exclusion and every org loses a workspace slot.
- The lazy bootstrap seeds no members (PAM's sweeps in every org admin; this one deliberately does not). Org
  admins join through `grant-admin-access`, from the product tile or the layout's `beforeLoad` when they arrive
  by link, and that route is where the `agent_vault_identities` meter moves for them. Only org creation seeds
  the creator.
- The traffic policy defaults to any-host (formerly Allow), in the DB default, the service and the dialog.
  Deliberate: the product brokers credentials, it is not an egress firewall, and under bundle-hosts the
  quickstart's agent could reach neither Anthropic nor npm until a bypass list exists. Settled with the
  product owner; bundle-hosts is documented as the hardening step.
- Wherever code branches on `ProjectType.PAM`, add the Agent Vault arm: `AgentVaultIdentities` metering emits,
  the admin-or-member predefined roles filter, `AuditLogStreamProduct`, `grantAgentVaultAccess` on the org
  invite. See the root `CLAUDE.md`.

## Grants and reachability

- A grant is a `memberships` row (`scope = resource`, `scopeResourceType = agent-vault-access-bundle`,
  `scopeResourceId = <bundle id>`) with one `membership_roles` row, slug `consumer`. The slug is a label;
  bundle access is decided in SQL, not CASL. Because it is the platform's table, the platform reaps grants
  on project removal, org removal, SCIM and every FK cascade. Do not add an Agent Vault reaper.
- `scopeResourceId` has no FK, so `deleteAccessBundle` deletes the bundle row first and then the grants in one
  transaction, and `addMembers` locks the bundle row (`lockByIdInProject`) before inserting. Keep that order.
- Granting is batch: one POST carries `{ userIds, identityIds, groupIds }`. That lock is what makes
  the dedupe read inside it authoritative, so an actor who already holds the bundle is returned in
  `skipped` rather than erroring; the unique index is only the backstop.
- Reachability has one implementation, `findReachableAccessBundleIds` over the platform's
  `findResourceMembershipsForActor`, and mint, member-facing reads and resolve all call it. A group's grants
  count only while the group confers a live role (`liveGroupIdsFrom`). Write no group-expansion SQL here.
- Reachability is a service-layer filter (`whereIn` on ids, `null` for an admin), not a CASL condition:
  conditions can interpolate only `identity.id`, `username` and `metadata`.
- The creator grant exists only for a creator with a direct project membership. A group-inherited admin gets
  none, so no individual grant row ever outlives its owner's membership.
- A cross-org or ungranted id is 404, never 403, and mint uses one message for an unknown and an ungranted
  name, so the error never confirms a bundle exists.
- Mint is the only endpoint addressed by bundle name; every resource path stays on ids. It is the only one a
  human or the CLI hand-writes, and names are slugs unique per project, so the CLI posts the name straight
  through instead of resolving it first. PAM does the same with `path: "folderName/accountName"`.

## Sessions and resolve

- The token is the lookup key, so it is stored as sha256 (not bcrypt) and returned exactly once.
- V1 caps a session at one bundle: `AGENT_VAULT_MAX_SESSION_BUNDLES`, mirrored by the CLI's once-only check on
  `--access-bundle` and the single-select Create Session sheet. The mint body stays a list, the junction table
  keeps `position`, resolve orders by position then name, and the Go matcher breaks ties by slice order, so
  lifting the cap is those three places plus the copy that says one (the api-docs string, the service's cap
  message, the sheet and sessions page, the CLI help and the docs), not a migration. It also needs a
  decision `bestMatch` does not make: it picks by host specificity alone, so a restricted winner would 403
  a request the other bundle's unrestricted service would have served.
- The bundle on a session is a ceiling fixed at mint and intersected with live reachability on every resolve.
  It can shrink and grow back, never past what was minted.
- Grants are read fresh on every resolve. The actor's role comes through the platform's permission cache
  (10 second marker), so a promotion or demotion can lag by that much on top of the proxy's poll.
- Resolve requires a live session-read permission, not a membership row: a lapsed time-limited role leaves
  its row behind, and `hasRole(Admin)` alone would fall through as member. An actor removed from the project
  surfaces as `ProjectMembershipNotFound`, which resolve turns into a 401 so the proxy drops the session on
  the next poll instead of riding its grace window.
- Removing an actor from Agent Vault does not revoke their sessions. The sessions resolve to nothing while
  the actor is out and work again if the actor is added back. Settled with the product owner.
- Session actor columns are `SET NULL` so history survives the actor. Resolve refuses a session with neither
  id: a null actor id reaches the membership lookups as `IS NULL`, matches user rows, and resolved as admin.
- Status is derived from `revokedAt`, `expiresAt` and the actor columns, never stored: a session with neither
  actor id reads as revoked in the list, the status filter and the sweep, so they agree with resolve refusing
  it. Expiry is enforced against the clock on every resolve. `sweepRetiredSessions` exists only for the 30
  day hard delete, which skips any session that recorded activity; there is no expiry audit event, matching
  every other product.

## Proxies

- Infisical stores no copy of a proxy's CA, only the fingerprint and expiry. Agents fetch the CA from the
  proxy's own unauthenticated `/_agent-vault/ca`, so the trust path has no dependency on Infisical and there
  is deliberately no download endpoint.
- The login route is unauthenticated (the enrollment token is the credential), so its audit event names the
  proxy as actor explicitly, as gateway, relay and KMIP enrollment do. Otherwise it logs as `unknownUser`.
- Health is judged against `heartbeatTTL`, the interval the proxy was running when it last checked in, not
  the row's current `pollInterval`. A proxy learns a new interval on its next poll, so comparing against the
  saved one would report a live proxy as unreachable until then. Gateway v2 does the same.
- The proxy's access token is non-expiring and revoked by bumping `tokenVersion`, which the auth plugin checks
  on every proxy request. Revoke Access goes through the shared resource-auth revoke so a pending enrollment
  token is burned too.
- Resolve is not audited: once per poll per session would swamp the audit table.

## Host and path grammar

`agent-vault-host-pattern.ts` is the grammar of record. The CLI matcher (`packages/agentvault/match.go`) does
the matching at runtime and reimplements the same rules, so a change here needs the same change there.

- Paths are rejected *in a host pattern*; `allowedPathPrefixes` is a separate filter that never decodes.
  A filter is judged by what it *allows*, so the refusals are the load-bearing half. The grammar is an
  allowlist because a prefix is compared against the escaped path: one carrying anything Go's encoder
  rewrites could never match. `agent-vault-path-prefix.ts` is the grammar of record, `policy.go` the match.
- Methods and path prefixes are filters on a service that already matched, **not** part of the match key,
  so the same-bundle host conflict rule stays host-only. Two services on one host differing only by method
  is still a hard reject.
- A violation is a 403 from the proxy, not a withheld credential. `NULL` is the only "unrestricted"; an
  empty array is never stored.
- There is no version negotiation with the proxy. A binary predating this drops the new resolve fields and
  enforces nothing while the UI shows the rules. Settled: accepted while the product is in preview.
- A portless pattern means 443, and that is the whole of what keeps a credential off a plaintext wire:
  injection in the proxy is scheme-blind, so naming a port (`:80` included) is how an admin opts a service
  into brokering over http.
- A wildcard is the leftmost label only and matches exactly one label. This is what makes every pattern pair
  identical, contained or disjoint, which is what makes conflict detection exact. Do not loosen it.
- Conflict detection is an intersection over individual patterns, because `hostPattern` is a comma-separated
  set. Same bundle: hard reject. Across bundles: allowed, since a session carries one bundle they never meet.
- Patterns are stored as typed and normalised at match time. `*.com` is accepted; settled as not a bug.

## Transformations

Two child tables, `agent_vault_service_custom_headers` and `agent_vault_service_substitutions`. "Custom
header" is the name in every layer; unqualified "header" means the credential's own.

- **There is no unique index on name or placeholder, and there must not be.** A rename that swaps two rows
  emits the two UPDATEs in sequence, so `UNIQUE (serviceId, lower(name))` fails the first against the
  second row's current value. Uniqueness is the list-level refine plus the bundle lock. Adding an index
  needs deferred constraints or delete-then-insert.
- The proxy writes substitutions, then custom headers, then **the credential last**, so nothing can
  overwrite the credential. A path substitution rewrites the path after the policy check, so a restricted
  service re-checks it.
- Stored rows **and the credential** are read inside the transaction, after the bundle lock. Outside it two
  concurrent PATCHes both pass the ownership check and the loser's writes no-op.
- A refusal after substitution must never quote the path: by then it carries the real credential, and the
  error text is both the 403 body and the log line.
- A PATCH replaces the whole list. Omitting a row's `value` keeps what is sealed; every other field
  replaces.

## Credentials at rest

- The KMS cipher pair is project-scoped (`KmsDataKey.SecretManager`) and built once per resolve.
- `credentialType` is a column and `credentialConfig` the plaintext half (header name, prefix), so a list page
  renders without a decrypt and a new credential type is a config entry, not a migration. For basic, the
  username is sealed with the password: some APIs put the whole key in the username.
- A service update is a patch. `AgentVaultCredentialUpdateSchema` makes every field optional and
  `mergeCredential` overlays what arrived. Never reuse `AgentVaultBearerConfigSchema` on that path: its
  `.default()`s would reset an omitted `headerName` to `Authorization`.
- The sealed secret has three write states: a value re-seals, `null` clears it (passthrough), `undefined`
  leaves it alone. `$decryptCredential` reads NULL as passthrough, so a bearer row that lost its secret would
  silently stop attaching a credential.

## Activity

Metadata only (method, host, path, status, decision), never bodies, headers or the query string. The agent is
hostile input: it must never be able to erase or hide its own records.

- **A customer S3 bucket is required**; there is no Postgres payload path. Infisical stores one index row per
  chunk (up to 1000 records) and seals or opens nothing; the bytes go proxy to bucket to browser.
- **Two keys.** The project data key (`KmsDataKey.SecretManager`) wraps a per-session activity key on the
  session row, and only the session key leaves the backend. It is minted at session create even while logging
  is off; sessions minted before this shipped have none and never record.
- **The AAD is `SHA-256("{projectId}|{sessionId}|{proxyId}|{chunkId}|v1")`**, sealed AES-256-GCM with a 12-byte
  IV and the tag appended. The Go proxy and the browser are both checked against the vector in
  `agent-vault-activity-crypto.test.ts`. It is also why `agent_vault_activity_chunks.proxyId` has no FK:
  `SET NULL` would make that proxy's chunks undecryptable.
- **Size is capped at every hop**: the proxy seals at 4 MiB against the server's 8 MiB, and reads stop at a
  byte budget as well as a record one. A chunk the server refuses counts as dropped on the next one.
- **Write inserts the row, commits, then presigns a create-only PUT** (`If-None-Match: *`). Row first so a
  failed upload is a visible gap, presign after commit so no network runs under the config row lock,
  create-only so a replay cannot replace a stored chunk (the proxy reads 412 as already uploaded).
- **A session keeps accepting late chunks for a day after it ends**: revoked, expired, or its owner deleted
  (read from `updatedAt`, which the FK's `SET NULL` bumps). Deleting an identity must not erase its last minute.
- **History pages order and cursor on `chunkId`** (a ULID, unique per session); split them and pages drop
  chunks. Live polling reads by our `createdAt` instead (`receivedAfter`, overlapping by
  `AGENT_VAULT_ACTIVITY_RECEIVE_OVERLAP_MS`), so repeats are expected and deduped by chunk id.
- **The org ceiling counts chunks** (`AGENT_VAULT_ACTIVITY_MAX_STORED_CHUNKS`) and is internal: no env var, no
  docs, and the API reports only `isStorageFull`. At the limit writes are refused, never drop-oldest, which
  would be an evidence-eviction primitive.
- **Infisical never deletes activity.** Sessions that recorded any skip the retention prune (their row holds
  the key), and nothing deletes from the bucket, so the policy asks for no `s3:DeleteObject`.
- **A save re-checks the connection whenever it puts it to a new use** (connection, bucket, region, prefix, or
  recording turned on), never on a save that only turns recording off. Changing bucket or prefix bumps
  `configVersion`, which orphans earlier history.
- **App connections are the one CASL subject the admin role carries**, because the shared
  `AppConnectionsTable` reads CASL, not the role. Everything else here is `hasRole(Admin)`.
- **Every by-id route under `/agent-vault/app-connections/aws/*` passes `findAppConnectionById` a `scope`**,
  so a connection outside Agent Vault is a 404 before any permission or app check. Without it a delete here
  could reach an org connection Secret Sync uses, and a 403 or 400 would confirm the id exists.

## The CLI

- Trust is stateless: `agent-vault run` fetches the CA from the proxy on every run; `--ca-fingerprint` is an optional
  pin checked before anything is written. Re-enrolling a proxy replaces its CA, so pins, mounted copies,
  keychain entries and any agent already running through it break until updated or restarted.
- No sandbox, nothing stripped. The agent gets the parent's whole environment plus the proxy URL (session
  token inside) and the CA trust variables. Settled with the product owner.
- The session flag is `--session-token`, not `--token`, so the root command's Infisical-token handling never
  reads it. The minting identity comes from `--client-id`/`--client-secret`, the access-token env vars, or the
  keyring login.
- The proxy exits after two consecutive heartbeat 401s: only Revoke Access, a deleted record or a changed
  signing secret produce one, and every session on it is dead at that point. Timeouts and 5xx ride the
  five-poll grace window and reset the counter.
- The enrollment dialog's Docker snippet mounts `/etc/infisical/agent-vault` (the root data dir). Without it a
  re-created container has no CA and a spent token.

## The frontend

- Admin is a role check on both sides, `hasRole(ProjectMembershipRole.Admin)`, not a CASL check. It decides
  the projected API shapes (`members` omitted from a bundle, settings omitted from a proxy) and the UI branches.
- The service template catalog (`helpers/agentVaultTemplates.ts`) is frontend-only and never persisted; icons
  re-derive from the stored host pattern. The backend must never learn a service name.
- Docs links live in `pages/agent-vault/agent-vault-docs-urls.ts`; keep them pointing at existing pages.
