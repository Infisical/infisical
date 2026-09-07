# Agent Vault — backend concept map

A concept map, not a spec. Read the code for detail; this file exists so you know **where** to look and
which invariants are load-bearing.

**The thesis.** An agent runs holding no credentials. Its HTTP traffic goes through a proxy we control,
which decides per request whether the host is allowed and attaches the real credential on the way out.
What an agent may reach lives in a **session** row on our side, never in anything the agent holds.

## The four nouns

| | |
| --- | --- |
| **Access bundle** | A named set of connections. The unit you grant to someone |
| **Connection** | One HTTP target plus its credential: host patterns, a credential type, the sealed secret |
| **Session** | A minted token naming one actor, a subset of their bundles, and an expiry. The token *is* the session |
| **Proxy** | A deployed egress node with its own certificate authority. One row per box |

## Module layout

```
agent-vault/                 shared: enums, host grammar, conflict detection, reachability
agent-vault-access-bundle/   bundles + connections + credential encryption
agent-vault-member/          product membership (add, role, remove); grants are written by the bundle service
agent-vault-session/         mint, revoke, list
agent-vault-project/         the per-org project's bootstrap and resolver
```

Routes live under `ee/routes/v1/agent-vault-routers/`, prefixed `/api/v1/agent-vault`.

## Invariants

**The project is a per-org singleton, created lazily.** `injectAgentVaultProjectId` is a `preValidation`
hook, so `GET /agent-vault/project` creates the project on first access — a deliberate REST deviation,
and the point of lazy bootstrap. Generic project create and delete are both blocked for this type, and
the project is excluded from `countOfBillableOrgProjects`; get that exclusion wrong and every org
silently loses a workspace slot.

**Reachability is a service-layer filter, not a CASL condition.** Conditions interpolate only
`identity.id`, `username` and `metadata`, so "who can reach this bundle" would stop being answerable in
SQL. `getAgentVaultReachability` returns an id array to `whereIn`, or `null` for an admin, who reaches
everything.

**A grant is a `memberships` row, not a table of ours.** `scope = resource`,
`scopeResourceType = agent-vault-access-bundle`, `scopeResourceId = <bundle id>`, one actor column, and one
`membership_roles` row with the `consumer` slug (a label only; bundle access is decided in SQL, not by
CASL). That is how PAM folders and cert-manager applications are stored, so the platform reaps grants for
us: project removal of any actor (`applicationMembershipCleanupService`, no type filter), user org removal
and SCIM (`deleteOrgMembershipsFn`, no scope filter), and the FK cascades on user, identity, group and
project. Do not add an Agent Vault reaper beside those; the previous one leaked three times.

**Two things the old FK gave for free are done by hand.** `scopeResourceId` has no FK, so
`deleteAccessBundle` deletes the bundle row first and then its grant rows in one transaction, and `addMember`
locks the bundle row (`lockByIdInProject`, `FOR UPDATE`) before inserting, so a concurrent delete either waits
and finds no bundle or reaps the fresh grant. Keep that order.

**Reachability has one implementation: `findReachableAccessBundleIds`** on the platform's
`membershipDAL.findResourceMembershipsForActor`, which expands `user_group_membership` for a person and
`identity_group_membership` for a machine identity. Mint, every member-facing read and the proxy's resolve
all call it, so Agent Vault hand-writes no group-expansion SQL. A group's grants count only while the group
confers a live role, taken from the permission result both paths already hold (`liveGroupIdsFrom`), so a
group whose Agent Vault role lapses stops conferring bundles at the same moment it stops conferring
permissions. Resolve therefore runs two replica reads rather than one correlated statement; the lag window
that opens is accepted for V1 and recorded in the resolve DAL's docblock.

**The creator grant follows the same rule as any grant.** Only a creator with a direct project membership
gets a `consumer` row; an admin who is in Agent Vault only through a group reaches the bundle as admin and
gets none. Individual rows only ever belong to direct members and group rows to groups, so no grant outlives
its owner's membership by any route, and Manage Access never names someone who is not in the product.

**Infisical stores no copy of a proxy's certificate.** The proxy serves its own CA unauthenticated on
its own listener, which is where every agent gets it, so the CA path has no runtime dependency on
Infisical: with the control plane down, an agent with a cached session still works. Only the fingerprint
(what an operator pins) and the expiry are recorded, derived once at enrollment. There is deliberately no
download endpoint — a second copy nothing verifies against is a liability, not a feature.

**A cross-org or unreachable id is 404, never 403.** A 403 would confirm the id exists. The mint path
uses the same message whether a bundle id is unknown or merely not granted.

**The session token is the lookup key, so it is sha256, not bcrypt**, and is returned exactly once. The
bundle set is a ceiling fixed at mint and intersected with live reachability on every resolve: it can
shrink, never grow. Nothing caches authorization, and the role is re-derived at resolve rather than
trusted from mint, so a demotion lands. Resolve also requires a live session-read permission, not just a
membership row: a time-limited role leaves its row behind when it lapses, and `hasRole(Admin)` alone
would let it fall through as a member.

**Session status is derived, never stored.** `revokedAt` and `expiresAt` are the only state; a read path
that writes is how "expired" ends up disagreeing with what the proxy sees.

## The host grammar, and why it is tight

`agent-vault-host-pattern.ts` is copied from `proxied-service-schemas.ts` and tightened twice:

- **Paths are rejected.** The matcher compares the decoded path while the upstream gets the escaped one,
  so `/v1/safe/../../admin` and `%2f` both collect a credential meant for `/v1/safe`.
- **A portless pattern defaults to 443.** An unspecified port used to match anything, so plaintext port
  80 sent the credential unencrypted. An explicit port stays allowed — `:80` included — so the proxy
  must *also* refuse to inject on an upstream it did not reach over TLS.

**A wildcard is the leftmost label only and matches exactly one label.** This is load-bearing, not a
syntax preference: it is what makes every pattern pair identical, contained or disjoint, and therefore
what makes write-time conflict detection exact rather than a heuristic. A mid-label glob or a second
wildcard would silently destroy it.

**Conflict detection is an intersection over individual patterns, not equality on the column.**
`hostPattern` holds a comma-separated *set*, so `{api.foo.com, api.bar.com}` and `{api.foo.com}` are a
genuine conflict. Within one bundle that is a hard reject, because nothing can break the tie. Across
bundles it is a warning, because the session's bundle order settles it.

`agent-vault-host-pattern-fixture.json` is the shared contract with the CLI matcher
(`packages/agentvault/match.go`). Change the rules there, not in a comment.

## The tail that lives outside these folders

**Metering.** `agent_vault_identities` is a seat count (users and machine identities with membership in the
project), metered beside `pam_identities`: every `usageMeteringService.emit(..., PamIdentities.key)` in a
generic membership path has an `AgentVaultIdentities` sibling, and the project resolver emits once when it
bootstraps. A dimension the licence does not price comes back as a 422 the usage queue swallows, so this
cannot double-charge; it exists so per-product pricing needs no backfill later.

**Retention and `session-expire`.** Expiry needs no sweep, since status is derived and the proxy drops its own
cache entry. `sweepRetiredSessions` runs inside `DailyResourceCleanup` for two things only: the
`session-expire` audit event, emitted once per session by advancing a keystore watermark
(`KeyStorePrefixes.AgentVaultSessionExpireSweep`, one-day look-back on first run), and hard-deleting rows
30 days past `expiresAt` or `revokedAt` through the two partial indexes. A `never` session is only reaped once
revoked.

**The org invite.** `grantAgentVaultAccess` on `/invite-org/signup` goes through
`agent-vault-member/agent-vault-membership-service.ts`, a PAM-shaped `addProductUserMembers` (settled with the
product owner over calling the generic membership service), so the invite path and the product agree on
role validation, SSO-alias resolution and metering. The Access Control page is Agent Vault's own and calls
`/api/v1/agent-vault/memberships`; only `MembersTab.tsx` and `InviteMembersDialog.tsx` still reach for the
generic hooks.

**Two enums kept 1:1 with `ProjectType`.** `AuditLogStreamProduct.AgentVault`, or a stream narrowed by
product never receives an Agent Vault event, and the predefined-roles filter in `project-role-fns.ts` that
returns admin and member only for Agent Vault (PAM deliberately keeps its full list, `dbe9dea14f`).

**`ResourceType.AgentVaultAccessBundle` has arms in `permission-service.ts`** (`resolveResourceRoleRules`,
`resolveResourceProjectAdminFallback`, `getResourcePermission`) so the shared switch never reads a grant row
as a cert-manager application. Nothing in Agent Vault calls them.

## The CLI

`infisical av proxy` and `infisical av run` live in the CLI repo (`packages/cmd/agent_vault*.go`,
`packages/agentvault/`). Two things about `av run` are product decisions rather than conveniences:

- **Trust is stateless.** It fetches the proxy's CA from `http://<proxy>/_agent-vault/ca` on every run and
  trusts it; `--ca-fingerprint` is an optional pin, checked before anything is written. Re-enrolling a proxy
  therefore needs no action for the *next* run; pins, mounted copies, macOS keychain entries, and any agent
  already running through the proxy (it trusts the old CA until restarted) break.
- **No sandbox, nothing stripped.** The child gets the parent's whole environment plus the session token inside
  the proxy URL and the CA trust variables. `INFISICAL_TOKEN` and universal-auth credentials are deliberately
  left in place: isolating the agent from its host is not this command's job, and pruning a few names would
  suggest a boundary that is not there (settled 2026-09-07). `--session-token` is the session token, named so
  the root's `--token` handling never sees it; the minting identity comes from `--client-id`/`--client-secret`,
  the access-token env vars, or the keyring login.

## The frontend

Pages live in `frontend/src/pages/agent-vault/`, hooks in `frontend/src/hooks/api/agentVault/`, and the
shared sheets and dialogs in `frontend/src/components/agent-vault/`. Agent Vault is an org-scoped
product: its URLs carry no `$projectId` and the project is resolved from the org, exactly as PAM's is.

**Whether a viewer is an administrator is a role check, not a CASL one**, on both sides —
`hasRole(ProjectMembershipRole.Admin)` on this project. That is what decides the projected shapes the
API returns (`members` omitted from a bundle, the three settings columns omitted from a proxy) and what
the frontend branches on to match. A member sees the Proxies page but not its settings, because the
fingerprint is the one thing they need from it.

**The service-name catalog is frontend-only.** Templates prefill a host pattern and a credential type
and are never persisted; icons re-derive from the stored pattern. Teaching this service anything about
"Anthropic" is what turned App Connections into a 114-member enum.

## Credentials at rest

The KMS cipher pair is project-scoped (`KmsDataKey.SecretManager`), built **once per resolve**, not once
per credential. The discriminator is a column, not a field inside the blob, so the deferred credential
types are a config entry rather than a migration — PAM put its discriminator inside and now carries
`withLegacyAuthMethod` to cope. `credentialConfig` is the plaintext half and is what lets a list page
render `Bearer · DD-API-KEY` with no decrypt. For basic it holds nothing: the username is sealed with the
password, because Stripe-style services put the whole key in the username, so a read path returns only
the type. A basic patch that names one half decrypts the stored pair to keep the other, the one decrypt on
the write path.

**A connection update is a patch, and the two schemas are separate for a reason.** `AgentVaultCredentialUpdateSchema`
makes every field but the discriminator optional, and `mergeCredential` overlays only what arrived. Do
not reuse `AgentVaultBearerConfigSchema` on that path: its `.default()`s belong to a create, and on a
PATCH they turn an omitted `headerName` into a reset, silently moving a `DD-API-KEY` credential back onto
`Authorization` so every upstream request 401s. The sealed secret has three states and they are not
interchangeable — a value re-seals, `null` clears the column for passthrough, and `undefined` leaves it
alone. `$decryptCredential` reads a NULL secret as passthrough, so a bearer row that lost its secret
would stop attaching a credential rather than fail.
