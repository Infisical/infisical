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

## Credentials at rest

The KMS cipher pair is project-scoped (`KmsDataKey.SecretManager`), built **once per resolve**, not once
per credential. The discriminator is a column, not a field inside the blob, so the deferred credential
types are a config entry rather than a migration — PAM put its discriminator inside and now carries
`withLegacyAuthMethod` to cope. `credentialConfig` is the plaintext half and is what lets a list page
render `Bearer · DD-API-KEY` with no decrypt.
