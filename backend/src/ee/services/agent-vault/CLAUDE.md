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
agent-vault-member/          the grant join table and its cleanup service
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

**Group expansion branches on actor type.** A user inherits through `user_group_membership`, a machine
identity through `identity_group_membership`. The `user_group_membership`-only version denies every
machine identity's group grants **silently** — an empty bundle list on a healthy-looking session, for
the product's primary actor.

**Grants live in our own table, so the shared reaper cannot see them.**
`agentVaultMembershipCleanupService` is wired into the same five call sites as
`applicationMembershipCleanupService`, inside the same transaction. Skip one and an actor removed from
the project keeps a grant the mint path still honours.

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
trusted from mint, so a demotion lands.

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
role validation, SSO-alias resolution and metering. The Access Control page itself uses the generic
membership services, because Agent Vault reuses the generic page.

**Two enums kept 1:1 with `ProjectType`.** `AuditLogStreamProduct.AgentVault`, or a stream narrowed by
product never receives an Agent Vault event, and the predefined-roles filter in `project-role-fns.ts` that
returns admin and member only for org-scoped products.

## The CLI

`infisical av proxy` and `infisical av run` live in the CLI repo (`packages/cmd/agent_vault*.go`,
`packages/agentvault/`). Two things about `av run` are product decisions rather than conveniences:

- **Trust is stateless.** It fetches the proxy's CA from `http://<proxy>/_agent-vault/ca` on every run and
  trusts it; `--ca-fingerprint` is an optional pin, checked before anything is written. Re-enrolling a proxy
  therefore needs no action from CLI users; only pins, mounted copies and macOS keychain entries break.
- **The agent holds nothing from Infisical.** The child gets the session token inside the proxy URL and the CA
  trust variables, with `INFISICAL_TOKEN` and universal-auth credentials stripped. `--token` is the session
  token, so the minting identity comes from `--client-id`/`--client-secret`, the access-token env vars, or the
  keyring login, never from `--token`.

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
render `Bearer · DD-API-KEY` with no decrypt.
