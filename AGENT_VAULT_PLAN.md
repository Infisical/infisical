# Agent Vault — implementation plan

## Start here

**You are implementing a new Infisical product called Agent Vault. This file is your only context.**
It was written by a planning session that explored both codebases, read the design docs, reviewed the
mockup, researched a competing product, and settled every open question with the product owner. No
outside design document is required, and several are actively stale — see
[Source documents](#appendix-a-source-documents-and-what-to-trust).

**In one paragraph:** agents run holding no credentials. Their HTTP traffic is pointed at a proxy you
deploy. The proxy decides per request whether it is allowed and attaches the real credential on the way
out, so the agent never sees the secret and cannot widen its own scope — what it may reach lives in a
session row on our server, not in anything the agent holds.

### How to use this document

1. Read [Ground rules](#ground-rules) and [Orientation](#orientation) — about five minutes.
2. Read [Decisions](#decisions-settled-in-planning) and
   [Do not re-derive these](#do-not-re-derive-these). The second one will save you hours, and will stop
   you "fixing" the plan back into things that are wrong.
3. Find your phase below and read that section plus anything it cross-references.
4. **Commit at every checkpoint, not once per phase.** Each phase section ends with a checklist. Tick
   items in this file as you go and commit the tree with the tick, so a session that dies leaves a clean
   tree and a checklist that says where it stopped.
5. **After every context compaction, re-read** [Ground rules](#ground-rules),
   [Do not re-derive these](#do-not-re-derive-these) and the current phase's checklist before writing
   more code. Each phase is one long session and will compact several times; compaction drops exactly
   the details those sections exist to hold.
6. **When you find the plan wrong, fix the sentence where it is wrong** and add a row to
   [Do not re-derive these](#do-not-re-derive-these). A note in Progress is not enough — the next
   reader reads the section, not the table.
7. **Update [Progress](#progress) when you finish**, including the latest checkpoint commit SHA. That
   is how the next session knows where you got to.

### Progress

Keep this current. It is the first thing the next session reads.

| Phase | Commit state | Notes |
| --- | --- | --- |
| 1 — backend core: project type, schema, bundles, sessions | **done** | 17 e2e tests (`backend/e2e-test/routes/v1/agent-vault.spec.ts`), 49 grammar tests, 3 role-dispatch tests — all green. Invariants 1, 3, 11 and 13 covered |
| 2 — backend proxy endpoints + `av proxy` | **done** (bar the Go e2e listed below) | Verified end to end on the dev stack: an enrolled proxy took a session token from curl and a real credential arrived at the upstream, with the agent holding nothing. Also confirmed live — reissue leaves `tokenVersion` alone and enroll bumps it, a replayed enrollment token 400s, a demoted admin's session narrows to `connections: []`, revoked is 401 and unknown is 404, the proxy token is rejected on human routes, `169.254.169.254` is 403 under the **allow** default, a bypassed host tunnels without TLS termination (curl reached it on system trust), an unmatched host is 403 under `deny`, and a settings change reached the running proxy on its next poll |
| 3 — frontend | **done** | Product registration, the implicit-project resolver, the four pages, the connection sheet and the template catalog. Walked end to end on the dev stack: sessions mint/reveal/revoke, bundle and connection create with the same-bundle conflict landing on its own field, Access Control resolving the Agent Vault project (3 identities, where every PAM project has 0), and the Proxies page (create with the three-tab reveal, reissue, edit landing `pollInterval` in the DB, revoke bumping `tokenVersion`, delete). A self-review then fixed seven things: an edit that silently dropped credential-setting changes when the secret was blank, a create whose Save did nothing with an empty secret, a blank page on a bundle 404, a re-POST after warnings, three hand-rolled slug regexes replaced by `slugSchema`, host-pattern 422s mapped onto the Hosts field, and the proxy actor added to the audit log UI. All seven verified live afterwards, including the cross-bundle warning arriving as a toast with the sheet closed. The bundle detail page's Create Session now hands the bundle to the Sessions page through an `accessBundleId` search param (validated on the route, stripped after the sheet closes), which the sheet preselects. Member view walked as a second user (`fias@infisical.com`, Agent Vault member, granted `echo-test`): only the granted bundle is listed with no create button or row menu, the detail page shows connections without a Members card or admin controls, Sessions has no Everyone switch and the member empty state, Proxies shows Name, Status, Version and CA only, the nav has no Governance group, and the typed Audit Logs URL gets the access-restricted dialog. A member who types the Access Control URL sees the generic page with a "Could not load role filters" error because the member role lacks role read; cert manager behaves the same and no product gates that route, so it is left alone. The generic add-user and add-group dialogs offered Viewer and No Access, which the Agent Vault backend resolves to Member (§1.3). Settled with the product owner: `getPredefinedRoles` in `project-role-fns.ts` now returns Admin and Member only for PAM and Agent Vault, and the role factory delegates to it instead of carrying its own copy of the list, so every picker (add user, add group, add machine identity, change role) follows without a frontend fork. PAM's API answer shrinks to what its own page already showed. Verified in the browser: the Agent Vault add-user dialog offers Admin and Member only. `make reviewable-ui` passes. Dev-stack note: the login drops every 25 to 40 minutes with `TokenReuse` in the backend log, because two tabs refreshing on the slow stack fall outside the refresh-token grace window. Keep one tab open while testing |
| 4 — backend tail, `av run`, docs, visibility commit | **in progress: §4.0 done** | `agent_vault_identities` is metered beside `pam_identities` at every membership write path (36 sibling emits plus the bootstrap paths), `AuditLogStreamProduct.AgentVault` exists with its picker entry, the invite route takes `grantAgentVaultAccess` and routes it through a PAM-shaped `agentVaultMembership.addProductUserMembers` (settled with the product owner over the generic call), and `DailyResourceCleanup` runs `sweepRetiredSessions`: it emits `session-expire` for sessions whose expiry fell since the last sweep (watermark in the keystore, one-day look-back on first run) and hard-deletes rows 30 days past `expiresAt` / `revokedAt`. Harness note: the e2e keystore does not read back its own writes (a plain probe returns null), so the sweep test builds the service from the real DALs and asserts the emitted events and pruned rows, not the watermark. **Next: `av run` in the CLI repo, then docs, then the visibility commit** |

**No open product questions.** Every one raised in planning was settled with the product owner and is
listed with its reasoning in [Decisions](#decisions-settled-in-planning). If you think you have found a
new one, check [Do not re-derive these](#do-not-re-derive-these) first — it is probably there.

**Running the e2e suite locally.** It runs inside the backend container (the host lacks `unixodbc` and a
darwin `@infisical/quic` build) against a throwaway Postgres started with
`max_locks_per_transaction=512` and a throwaway Redis, both on the compose network. **Pass
`DB_CONNECTION_URI` and `REDIS_URL` explicitly to `docker exec`**: the container sets both in its own
environment, `dotenv` does not override an already-set variable, and the harness opens with
`DROP SCHEMA public CASCADE` — so a run that inherits the container's environment drops the dev database.

**Audit persistence cannot be observed locally, by anyone.** `audit-log-queue.ts:107` drops every entry
when `plan.auditLogsRetentionDays` is falsy, which is the unlicensed default *and* what the e2e license
mock returns (`__mocks__/license-fns.ts:27`). So the emit calls are wired and type-checked — each event
has its enum member, interface and union arm, and the handler awaits `createAuditLog` — but no test in
this repo asserts an audit row lands, ours included. Verifying that needs an instance with retention
days set.

**Two things do need a human, and neither blocks starting:**

| What | Where | When to raise it |
| --- | --- | --- |
| ~~Two REST deviations~~ | §1.7 | **Both settled with the product owner, 2026-09-02.** The `GET` that bootstraps the project **stays**, matching PAM, with a comment on the route saying the deviation is deliberate. `GET /proxies/:proxyId/ca` was **deleted** along with the stored PEM — see §1.2 |
| ~~Org-invite grant shape~~ | §1.1 | **Settled 2026-09-02: mirror PAM.** `agent-vault-member/` grows its own `addProductUserMembers`, shaped like PAM's, rather than writing memberships directly in the invite path or extracting a shared helper (which would mean changing PAM's live signup-invite flow inside an already-large PR) |

---

## Ground rules

These are the working agreements from the planning session. They are not optional.

| | |
| --- | --- |
| **Do not remove anything** | The existing proxied-services / agent-proxy feature stays untouched. See [Nothing is removed](#nothing-is-removed). If you find yourself editing `proxied-service/`, `agent-proxy-ca/` or `packages/agentproxy`, stop |
| **One PR per repo, at the end** | Work accumulates on the `agent-vault` branch in each repo. Do not open a PR per phase. See [Phasing](#phasing) |
| **Never commit or push unasked** | Committing a phase is expected; pushing and opening PRs is not. Ask |
| **Never create GitHub issues** | Repo policy (`AGENTS.md`) |
| **Use the PR template** | `.github/pull_request_template.md`, filled in completely, and cross-link the two PRs |
| **Read `backend/CODE_QUALITY.md`** | Required for every backend change. It is short. The parts that bite here: bounded Zod on every input, `tx` threaded through every call inside a transaction, no network calls between BEGIN and COMMIT, 404 not 403 for cross-org, and REST deviations raised rather than silently implemented |
| **Do not run `make reviewable-*` after small edits** | Run `make reviewable-api` / `make reviewable-ui` once before opening each PR |
| **Do not stage unrelated local changes** | The working tree carries local-only edits (`package.json` `@typescript/native-preview`, a `mockup/` directory). Stage only files you touched |
| **Ask rather than guess on product decisions** | One question at a time, with options and a recommendation. Do not batch four questions into one message |

---

## Orientation

### Repos and branches

| Repo | Worktree | Branch | Holds |
| --- | --- | --- | --- |
| `Infisical/infisical` | `/Users/saif/infi/repos/infisical.agent-vault` | `agent-vault` | `backend/`, `frontend/`, `docs/` |
| `Infisical/cli` | `/Users/saif/infi/repos/cli.agent-vault` | `agent-vault` | Go CLI, `packages/agentproxy` |

Both are already on the right branch. `main` is the base for both PRs.

There is a third worktree of the *same* Infisical repo at
`/Users/saif/infi/repos/infisical.agent-product` (branch `agent-product`) holding the untracked design
docs. It is not a separate codebase and you should not work in it.

### How paths are written in this document

Most are abbreviated to the part that identifies the file, because the full ones are long and repetitive.
Resolve them against these roots, in order:

| Looks like | Lives under |
| --- | --- |
| `services/…`, `ee/services/…`, `db/…`, `server/…`, `lib/…` | `backend/src/` |
| `pages/…`, `layouts/…`, `components/…`, `hooks/…`, `helpers/…`, `index.css`, `routes.ts` | `frontend/src/` |
| `packages/…` | the **cli** repo |
| Anything else with a leading `backend/` or `frontend/` | the Infisical repo root |

If a path is ambiguous, `find backend/src frontend/src -path "*<fragment>"` resolves it. One genuine
trap: there are **two** `project-router.ts` files, and the generic project-create route is the
`server/routes/v1/` one, not the `ee/routes/v1/` one.

A path with no `:line` suffix that does not exist yet is a file **you are creating** — every one is
named `agent-vault-*` or sits under `agent-vault/`.

### Files worth reading in the repo

| Path | Why |
| --- | --- |
| `backend/CLAUDE.md` | Service factory + manual DI, DAL conventions, auth modes, queues vs cron, alerting |
| `backend/CODE_QUALITY.md` | Mandatory. See Ground rules |
| `frontend/CLAUDE.md` | Routing DSL, React Query conventions, v2 vs v3 components |
| `DESIGN.md` (repo root) | The v3 visual system and product voice. Read before writing UI or user-facing copy |
| `backend/src/ee/services/pam/CLAUDE.md` | PAM is the closest existing product and the template for most of Phase 1 |

### Environment and commands

```bash
# backend
cd backend
npm run migration:new           # create a migration (interactive)
npm run migration:latest-dev    # apply
npm run generate:schema         # regenerate src/db/schemas/ — ALWAYS after a migration
npm run test:unit
npm run type:check

# frontend
cd frontend
npm run dev
npm run type:check              # use this, NOT `npx tsc -p tsconfig.json`, which silently misses errors

# cli (Go)
cd /Users/saif/infi/repos/cli.agent-vault
go build ./... && go test ./packages/agentvault/...

# full local stack
docker compose -f docker-compose.dev.yml up
```

Two gotchas that will cost you time:

- **`npm run generate:schema` does not touch `src/db/schemas/models.ts`.** `TableName` and the
  `ProjectType` enums are hand-edited. Add the `TableName` entries *before* the migration compiles.
- **Some backend unit tests fail on a missing `@infisical/quic` native binary.** If you hit that, run
  the suite with `vitest.unit.config.mts` and a stub alias for `@infisical/quic` rather than debugging
  the import.

---

## Context

Agents run with no credentials. Their HTTP traffic goes through a proxy we control, which decides
what is allowed and attaches the real credential at egress.

The shipped **proxied services / secrets brokering** feature cannot be that product. It has no route
and no nav entry (its only door is a dropdown on Secret Manager Overview, disabled unless exactly one
environment is selected). Access is folder-wide. Credentials are name references with no FK, so a
renamed secret silently produces uncredentialed requests. Nothing is recorded beyond CRUD. And the
deepest problem: **scope is client-supplied** — project, environment and path ride in the proxy URL
and the agent holds its own token, so it can rewrite them. Authorization today is "whatever scope the
client asserted, intersected with what the proxy identity can read."

Agent Vault replaces that with a server-side **session** row as the only source of truth for what a
running agent may reach. An admin builds an **access bundle** of **connections**, grants it to users,
machine identities or groups, a member mints a **session** over bundles they can reach, and the
**proxy** resolves that session per request.

### Nothing is removed

`backend/src/ee/services/proxied-service/`, `agent-proxy-ca/`, the `proxied_services` /
`proxied_service_credentials` / `org_agent_proxy_config` tables, `packages/agentproxy`, the
`infisical secrets agent-proxy {start,connect,run}` commands, the Secret Manager UI entry and the
`docs/documentation/platform/agent-proxy/` pages all stay untouched. Agent Vault is built alongside
them. See [Deferred: retiring proxied services](#deferred-retiring-proxied-services).

So "absorb" in the design doc becomes **copy**, not move: `packages/agentproxy` keeps compiling and
keeps its tests, and the new engine is a sibling package. The coexistence has one hard cost, called
out in §2.6 — the two proxies cannot share a default port.

### Spec of record

**This plan.** It was built from a review doc referred to during planning as "v2", which **is not on
disk anywhere** — it existed only in the planning conversation. Its content is fully folded in here, and
its deltas from the v1 review on disk are listed in
[Appendix A](#appendix-a-source-documents-and-what-to-trust) so you can recognise them if someone
mentions them. Do not go looking for the file.

---

## Decisions settled in planning

| | Decision |
| --- | --- |
| **Plan shape** | **One `agent-vault` branch per repo, a commit per phase, one PR per repo at the end** — infisical and cli, opened together and merged together. The four phases are commit sequencing, not merge milestones |
| **Licensing** | **No flag.** No `agentVault` entry in `TFeatureSet`, no `UpgradePlanModal` gate. Diverges from PAM, which gates on `subscription.pam`. Not needed here: everything merges at once, so there is no window to gate |
| **`av run` sandboxing** | **None.** `av run` sets environment variables and execs. It does not isolate the child from the filesystem or the network |
| **Session bundle set** | **Ceiling at mint, intersected live.** Fixed at mint so it can never grow; re-checked on every resolve so losing a grant removes it from a running session automatically. Mechanism in §1.8 |
| **`unmatchedHost` default** | `allow` |
| **CLI namespace** | `infisical av` |
| **Protocol gaps** | Ship v1 with all three gaps unfixed (WebSocket, 30-minute streaming, h2). Documented as unsupported, not silently broken |
| **Re-enrollment on restart** | Persist and compare, like gateway — reasoning in §2.6 |
| **CA trust** | **The CLI fetches the CA from the proxy every run and trusts it; `--ca-fingerprint` is an optional pin.** One mechanism, stateless, no Infisical round-trip. Matches the comparable open-source Agent Vault. Residual risk and its reasoning in §4.1 |
| **Conflicting connections** | **Reject a connection sharing any pattern with another in the same bundle, allow containment, warn across bundles.** Overlap is fully decidable because a wildcard is leftmost-only and single-label. Runtime ladder: exact beats wildcard, then bundle `position`, then name. **No fallback** on a `401`/`403`. Full reasoning and prior art in §1.6.1 |
| **Unmatched-host wording** | **`deny`**, not `block`. Matches every doc written so far and reads better beside `allow`. The copied Go engine's `UnmatchedBlock` is renamed in our fork — one line in a file we write from scratch, and the original is untouched |
| **`lastUsedAt` on connections** | **No.** v1 ships with no per-connection usage signal, as `AGENT_VAULT.md` says |
| **Credential validation on save** | **None.** A real test means the backend making outbound calls to arbitrary customer hosts, which is an SSRF surface, and there is no generic "is this token valid" request for an arbitrary API |
| **Per-product metering** | **Add an `agent_vault_identities` dimension**, mirroring `PamIdentities` — §1.1 |
| **Naming** | **Keep** Sessions / Access Bundles / Connections / Proxies, despite collisions with PAM, App Connections and Networking. Settled across both review docs and the mockup |
| **Backend language** | Node (`backend/src/ee/`), not Go. `backend-go` covers platform + secretmanager only; CASL, KMS cipher pairs, audit logs and `resource-auth-method` all live in Node |

---

## Corrections to the design docs

Six claims in the docs do not survive contact with the code. Each changes the work.

**1. `createProject` does not block PAM, so we write the guard ourselves.**
`AGENT_VAULT.md` §9.1 says "Blocked: reject this type in `createProject`," implying PAM demonstrates
it. It does not. `backend/src/server/routes/v1/project-router.ts:222` accepts `type: z.nativeEnum(ProjectType)` with PAM
valid, `createProject` has no guard, and no unique index exists. PAM only guards *deletion*
(`project-service.ts:771-776`). We need both, and neither is a copy.

**2. PAM's admin role is aliased to the generic project admin — the thing the doc warns against.**
`default-roles.ts:1153` is literally `export const pamProjectAdminPermissions = projectAdminPermissions;`.
So `AGENT_VAULT.md` §4.3's "do not alias to `projectAdminPermissions`" is correct advice and PAM is the counter-example,
not the template.

**3. `getPredefinedRoles` needs no edit.** The doc flags a duplicated bug across
`project-role-factory.ts` and `project-role-fns.ts`. Neither special-cases PAM: PAM reuses the generic
`admin` / `member` slugs and relies on the type dispatch in `buildProjectPermissionRules`. We do the
same, so both files stay untouched — less work than the doc implies.

The `projectType`-is-optional trap is real and the doc's count is exact: **8 call sites in
`permission-service.ts` omit it** (935, 974, 1007, 1146, 1256, 1279, 1368, 1391). Lines 736, 1113, 1127
and `folder-access-roles-fns.ts:75` pass it.

**4. The five templates the doc says to drop are not in the catalog, and the real problem is different.**
`AGENT_VAULT.md` §6.4 says "Copy 30 of the 35 … AWS, GCP, Azure, Snowflake and Salesforce are dropped."
`proxiedServiceTemplates.ts` has exactly 35 entries and **none of those five is among them**. The
actual work:

- **Three templates carry a path**, not two: `discord.com/api/*` (`:318`), `gitlab.com/api/*` (`:342`),
  and `google-workspace` (`:460`). The first two strip cleanly to a bare host.
- **`google-workspace` is the one that needed a product decision.** Its pattern is
  `gmail.googleapis.com/*, sheets.googleapis.com/*, www.googleapis.com/calendar/*,
  www.googleapis.com/drive/*, www.googleapis.com/upload/drive/*`. Three of those five differ **only by
  path on the same host**, so stripping paths collapses them into one `www.googleapis.com` and broadens
  the credential across all of Google's API surface. **Settled: ship it narrowed** —
  `gmail.googleapis.com, sheets.googleapis.com, www.googleapis.com`, with a `caveat` line in the picker
  stating plainly that the third covers every Google API, not just Calendar and Drive. This is the first
  real user of the `caveat` field — which §3.2 adds, it does not exist on the catalog today — so it also sets the tone for how bluntly those are written.
- **Three carry a tenant wildcard**: `*.supabase.co`, `*.atlassian.net`, `*.myshopify.com`. Customers
  own those subdomains, so a rogue agent could send the credential to a stranger's tenant. Ship
  `<your-tenant>.atlassian.net` placeholders. The count of three is right; only `AGENT_VAULT.md` §6.4's
  list of five is stale.

**5. The doc conflates the two existing CLI commands.** `AGENT_VAULT.md` §11 says "the old local mode sandboxed the
child because `connect` handed it an Infisical token." Different commands:
`secrets agent-proxy run` is the **local, sandboxed** mode and hands the child **no** token
(`INFISICAL_TOKEN` is stripped at `agent_proxy_run.go:462`); `secrets agent-proxy connect` is the
**remote, unsandboxed** mode and *does* set it. This matters because the sandbox in `run` is protecting
`~/.aws` and `~/.ssh`, not a token — so dropping it from `av run` is a real, if accepted, reduction.

**6. v2 contradicts itself on revocation, and the contradiction is resolved in favour of live
re-checking.** v2's members table says "Revoke. Live sessions run until they expire"; its resolve
section says a 200 may carry an empty list "if the actor lost access to every access bundle." Only the
second is right. See §1.8.

Smaller: the Go package is `packages/agentproxy`, not `packages/agent-proxy`, and
`maxConcurrentConns = 512` lives in `proxy.go:59`.

**One vocabulary mismatch, settled as `deny`.** v2 writes the policy as `allow` / **`deny`** in its
schema, API examples and heartbeat payload; the Go side spells it `UnmatchedAllow` / **`UnmatchedBlock`**
(`proxy.go:27-29`). We standardise on **`deny`** across the column, the API value, the UI label and the
engine constant, renaming `UnmatchedBlock` → `UnmatchedDeny` **in our fork only**. That is one line in a
file we are writing from scratch, `packages/agentproxy` is untouched, and it keeps every document
written so far correct.

### The mockup diverges from the settled design in six places

`mockup/Agent Proxy.dc.html` encodes the access-bundle model correctly — no agent-groups or invoker
leftovers from the earlier entity model, which survive only in
`mockup/uploads/agent-proxy-mockup-prompt.md` (the *original* prompt; read it as history). But it is
ahead of v2 in four places. **Follow v2:**

| Mockup | v2 | Build |
| --- | --- | --- |
| 5-step sheet: Template → Credential → Scope → **Transforms** → Review | no transforms | 4 steps |
| Sessions page has a **Requests** tab | audit logs only in v1 | no Requests tab |
| Credential types include SigV4, OAuth2 | bearer / basic / passthrough | 3 types |
| Its own `CATALOG` in `agent-proxy-engine.js` — 34 entries **including** AWS, GCP, Azure, Snowflake, Salesforce, with `paths` and `methods` in a separate `TPL` map | — | Build the picker from `proxiedServiceTemplates.ts`, **not** the mockup's catalog. The mockup's five cloud entries need credential types we do not have, and its `paths`/`methods` fields are banned by the grammar |

Two more mockup statements are wrong against the settled design. Its **revoke text** says live sessions
are not retroactively narrowed — §1.8 says they are, so the *claim* must not be copied, though the
dialog's "takes effect on the next request" framing is right and §2.3 keeps it. And its embedded spec prose
says the **unmatched default** is `deny` (the JS actually defaults to `forward`); settled as `allow`.

That is six divergences in total — the four in the table plus the two above. Everything else in the
mockup is usable: the nav, the bundle-detail shape, the Proxies table with
bypass-host and unmatched columns, and the visual language.

---

## Phasing

**One branch per repo, one commit (or a few) per phase, one PR per repo at the end.** Both repos are
already on an `agent-vault` branch. Work accumulates there through all four phases; a single PR per repo
covers the entire product, and the two are opened and merged together.

Nothing lands on `main` until the whole thing is ready, so there is never a window where a half-built
product is reachable. The product is visible the moment it merges.

The four phases are **internal sequencing only** — how to order the work and the commits on that branch.
They are not merge milestones, not separate PRs, and not releases.

```
Phase 1  backend      project type, 6 tables, access-bundle + session APIs
   ├── Phase 2  backend proxy endpoints  +  cli av proxy      ─┐
   └── Phase 3  frontend                                       ├─ both need 1; run 2, then 3
                                                               │
Phase 4  backend tail + cli av run + docs + visibility  ───────┘  needs 2 and 3
```

Phases 2 and 3 depend only on Phase 1. They run one after another, one session each — the diagram
shows dependency, not parallelism. Phase 4 needs Phase 2's `/proxy/resolve` and the proxy's CA listener
to test against, and Phase 3 because the visibility commit is the last thing on the branch.

**Rough size**, from the original design doc: backend ~4 weeks, frontend ~3 weeks, CLI ~2 weeks. Phase
1 and Phase 3 are the largest. Phase 4 took over Phase 1's tail (metering, invite flag, audit-stream
value, retention sweep) so the four are closer in size. **Each phase is one long session.** Expect it
to compact several times; the per-phase checklists and checkpoint commits are what make that
survivable, so use them.

**Order the visibility change as the final commit** — the three arrays in §3.0 that put Agent Vault in
the org landing tiles, the navbar product switcher and the signup picker. Not to gate anything, since
it all merges at once regardless, but so a reviewer can see in a single diff exactly where the product
goes live. That is the only sequencing constraint that survives beyond "build the backend before the
things that call it."

Both PRs use `.github/pull_request_template.md`, filled in completely, and each links the other in its
description — neither half works alone and a reviewer should not have to discover that.

---

## Phase 1 — Backend: platform, schema, access bundles, sessions

Everything a human can do. No proxy, no CLI. Ends with an API you can drive with curl.

**Four pieces specified in this phase are built in Phase 4**, so the two sessions are closer in size:
the `agent_vault_identities` metering dimension (§1.1), the `AuditLogStreamProduct` value (§1.1), the
org-invite `grantAgentVaultAccess` flag (§1.1) and the retention sweep with its `session-expire` event
(§1.8, §1.9). They stay described here because this is where their context lives; each is marked
**[Phase 4]**. Nothing in Phases 2 or 3 depends on them.

Projects are created two ways: **eagerly** for orgs and sub-orgs created after this merges, and
**lazily** on first access for every org that predates it. Either way a row appears for any org whose
users touch the product, which is why the billable-count exclusion below is not cosmetic — get it wrong
and those orgs silently lose a workspace slot.

### 1.1 Project type

Follow `pam-project/`; its resolver is worth copying line for line.

| Step | File |
| --- | --- |
| `AgentVault = "agent-vault"` in both enums | `db/schemas/models.ts:457-470` (hand-edited, not generated) |
| Bootstrap: create the project, seed org admins as project admins | new `ee/services/agent-vault-project/agent-vault-project-bootstrap.ts`. **No default templates to seed** — that half of PAM's bootstrap has no analogue |
| Resolver: `withCache` + `pg_advisory_xact_lock(hashtext('agent-vault-bootstrap:<orgId>'))` + in-lock re-check | new `agent-vault-project-resolver.ts`, copy `pam-project-resolver.ts` |
| `preValidation` hook setting `req.internalAgentVaultProjectId` | new `server/plugins/inject-agent-vault-project-id.ts` |
| Eager bootstrap at org and sub-org create | `services/org/org-service.ts:714`, `ee/services/sub-org/sub-org-service.ts:114` |
| `agentVaultProjectId` on the org read payload | `org-service.ts:222`, `routes/v1/organization-router.ts:97`, **and the frontend type at `hooks/api/organization/types.ts:42`**, which carries `pamProjectId` today. The layout's `beforeLoad` reads it off the cached org, so missing the frontend half means an extra fetch on every navigation |
| **Block generic create** (correction 1) | `project-service.ts` `createProject` |
| **Block delete** | `project-service.ts:771-776`, an arm beside PAM's |
| Keystore prefix + TTL | `keystore/keystore.ts`, beside `PamDefaultProject` |

Then work the `ProjectType.PAM` grep — 17 backend files reference it. The ones needing an arm or a
deliberate exclusion are below; re-run the grep to catch any the list misses:

- **`project-dal.ts:1021` — exclude from `countOfBillableOrgProjects`, in the same change as the
  bootstrap.** The count feeds `plan.workspaceLimit` at `project-service.ts:290`, and that gate fires
  only for `type === ProjectType.SecretManager` while the count includes every non-excluded type. An
  unexcluded Agent Vault row silently costs every org a workspace slot and starts refusing
  secret-manager project creation on a plan at its limit. It also skews `workspacesUsed` on the billing
  page (`license-service.ts:199`).
- **`project-service.ts:2254-2258` — `requestProjectAccess` builds the callback URL.** PAM is
  special-cased to an org-scoped link; everything else gets `/projects/<slug>/<id>/access-management`.
  Agent Vault has no project-scoped route, so without an arm an access-request email links to a 404.
- `permission-service.ts` — role dispatch (§1.3) and the resource-permission-audit ternary at `:854`
- `identity-v2/identity-service.ts:153,246` — restrict project identity roles to Admin/Member
- `app-connection/app-connection-fns.ts:443` — return `false`
- `services/org-product-stats/org-product-stats-dal.ts` (×3) — landing counters
- **[Phase 4]** **`services/license-client/` — add an `agent_vault_identities` metered dimension**, mirroring `PamIdentities`:
  a `defineLimitFeature("agent_vault_identities", 0)` in `features.ts:13`, a `countAgentVaultIdentities`
  wrapping `countProjectIdentities(ProjectType.AgentVault, orgId)` in `usage-counter-dal.ts:178`, and
  entries in `METERED_DIMENSION_KEYS` and `buildMeteredFeatures` (`usage/usage-counters.ts:20,44`).
  Then `usageMeteringService.emit` / `emitForProject` at the membership write paths, as
  `pam-membership-service.ts:430,563,716` does, plus the two shared arms in `scim-service.ts:895` and
  `group-service.ts:714`.
  **This cannot double-charge anyone.** The backend only reports snapshots; the license server decides
  what is priced, and returns a 422 "not priced by any active product on this license" for a dimension
  the plan does not carry, which `usage-event-queue.ts:87-110` swallows without retrying. Note also
  that despite the name, `countProjectIdentities` counts **users and machine identities** with
  membership in the product's projects — it is a seat count, not a machine count. Agent Vault
  identities are already billed org-wide via `IdentitiesMeter` regardless; this dimension is what makes
  per-product pricing possible later without a backfill.
- `alert/providers/identity-credential-alert-provider.ts:106` — org-scoped view URL
- `project-service.ts:203,208` — label and URL-slug maps

**Two things outside that grep:**

- **[Phase 4]** **`AuditLogStreamProduct` (`ee/services/audit-log-stream/audit-log-stream-enums.ts:23`) — a silent
  failure if missed.** Its own comment says the values are kept 1:1 with `ProjectType`.
  `resolveAuditLogProduct` casts a project's type straight into it, and `auditLogMatchesStreamFilter`
  returns `false` for anything not in a stream's filter list. So any customer who has narrowed their
  audit-log stream by product will never receive a single Agent Vault event, with no error anywhere.
  Add the enum value and the frontend picker entry.
- **[Phase 4]** **The org-invite grant flag.** `invite-org-router.ts:37,123` has `grantPamAccess`, which seeds PAM
  project membership on invite. The chain is `SignUpPage.tsx:207` / `SignupOnboardingPage.tsx:124` →
  `components/auth/TeamInviteStep.tsx:33,40,53,88` → `hooks/api/users/types.ts:187` (**not**
  `signupProducts.ts`). Add `grantAgentVaultAccess` the same way, or new orgs invite people into a
  product they cannot see. Not mentioned in the docs.
  **There is no generic service to call.** `grantPamAccess` routes through
  `server.services.pamMembership.addProductUserMembers` (`:124`), a PAM-specific product-membership
  service carrying role validation, metering and access-request cleanup. Nothing generic exists, so
  either `agent-vault-member/` grows an equivalent `addProductUserMembers` or the invite path writes
  memberships directly. Budget it; it is not a one-line flag.

### 1.2 Schema — 6 new tables, 1 altered

One migration, then `npm run generate:schema`, then hand-add the six `TableName` entries to `models.ts`
(the generator does not touch that file).

```
agent_vault_access_bundles
  id           uuid      PK      default knex.fn.uuid()
  projectId    varchar(36) NOT NULL FK -> projects.id CASCADE   -- projects.id is varchar, not uuid
  name         varchar(64)  NOT NULL   slug: lowercase, digits, hyphens
  description  varchar(256) NULL
  createdAt / updatedAt  timestamptz NOT NULL default now(), createOnUpdateTrigger
  UNIQUE (projectId, name)          -- also covers the projectId FK and ORDER BY name

agent_vault_connections
  id                  uuid      PK
  accessBundleId      uuid      NOT NULL   FK -> agent_vault_access_bundles.id CASCADE
  name                varchar(64)  NOT NULL   slug
  hostPattern         varchar(1024) NOT NULL  ONE column, comma-separated. See note below
  credentialType      varchar(32)  NOT NULL
  credentialConfig    jsonb     NOT NULL   no DB default, see below   non-secret, see §1.5
  encryptedCredential bytea     NULL       NULL only for passthrough; enforced in the service, not a CHECK
  createdAt / updatedAt
  UNIQUE (accessBundleId, name)     -- also covers the FK
  CHECK  credentialType in ('bearer','basic','passthrough')

agent_vault_access_bundle_members
  id              uuid  PK
  accessBundleId  uuid  NOT NULL  FK -> agent_vault_access_bundles.id CASCADE
  userId          uuid  NULL      FK -> users.id CASCADE
  identityId      uuid  NULL      FK -> identities.id CASCADE
  groupId         uuid  NULL      FK -> groups.id CASCADE
  createdAt / updatedAt
  CHECK  num_nonnulls(userId, identityId, groupId) = 1
  UNIQUE (accessBundleId, userId)     WHERE userId     IS NOT NULL
  UNIQUE (accessBundleId, identityId) WHERE identityId IS NOT NULL
  UNIQUE (accessBundleId, groupId)    WHERE groupId    IS NOT NULL
  INDEX (accessBundleId)                          -- "who can reach this bundle"
  INDEX (userId)     WHERE userId     IS NOT NULL -- the three reverse lookups
  INDEX (identityId) WHERE identityId IS NOT NULL --   memberships lacks, and the
  INDEX (groupId)    WHERE groupId    IS NOT NULL --   ones §1.8's hot path needs

agent_vault_sessions
  id          uuid  PK
  projectId   varchar(36) NOT NULL FK -> projects.id CASCADE
  userId      uuid  NULL      FK -> users.id CASCADE       -- CASCADE, not SET NULL
  identityId  uuid  NULL      FK -> identities.id CASCADE
  tokenHash   varchar(64) NOT NULL   sha256 hex. Never the token
  expiresAt   timestamptz NULL       NULL means never
  revokedAt   timestamptz NULL
  lastResolvedHash varchar(64) NULL  sha256 of the last returned connection-id set; see §1.9
  createdAt / updatedAt
  UNIQUE (tokenHash)
  CHECK  num_nonnulls(userId, identityId) = 1
  INDEX (projectId, createdAt DESC)               -- the list page
  INDEX (userId)     WHERE userId     IS NOT NULL
  INDEX (identityId) WHERE identityId IS NOT NULL
  INDEX (expiresAt)  WHERE expiresAt  IS NOT NULL -- the retention sweep, see §1.8
  INDEX (revokedAt)  WHERE revokedAt  IS NOT NULL -- the other half of the same sweep

agent_vault_session_access_bundles
  id                uuid  PK
  sessionId         uuid  NOT NULL  FK -> agent_vault_sessions.id CASCADE
  accessBundleId    uuid  NULL      FK -> agent_vault_access_bundles.id SET NULL
  accessBundleName  varchar(64) NOT NULL   denormalised, survives bundle deletion
  position          smallint NOT NULL      0-based, order named at mint
  createdAt         timestamptz NOT NULL   -- insert-only: no updatedAt, no trigger
  UNIQUE (sessionId, accessBundleId) WHERE accessBundleId IS NOT NULL
  UNIQUE (sessionId, position)
  INDEX (sessionId), INDEX (accessBundleId)

agent_vault_proxies
  id                 uuid  PK
  projectId          varchar(36) NOT NULL FK -> projects.id CASCADE
  name               varchar(64) NOT NULL  slug
  tokenVersion       integer NOT NULL default 0    bump to revoke; see §2.1
  rootCaFingerprint  varchar(102) NULL  'SHA256:' + 64 hex + 31 colons. Parsed once at enroll
  rootCaExpiresAt    timestamptz NULL   parsed once at enroll
  heartbeat          timestamptz NULL   last successful POST /proxy/heartbeat. NULL = never checked in
  version            varchar(32) NULL   proxy build, self-reported on heartbeat. Shown on the Proxies page
  unmatchedHost      varchar(16) NOT NULL default 'allow'
  bypassHosts        varchar(1024) NULL   comma-separated, same grammar as hostPattern
  pollInterval       integer NOT NULL default 60   seconds
  createdAt / updatedAt
  UNIQUE (projectId, name)
  CHECK  unmatchedHost in ('allow','deny')     -- Go constant renamed to match
  CHECK  pollInterval between 10 and 300
```

Four things the column list does not say on its own:

- **`hostPattern` is one column holding a comma-separated set**, matching `proxied_services.hostPattern`
  (`varchar(255)` today; we widen to 1024). Not a child table, not an array. Every validation and
  conflict rule expands it to individual patterns first — §1.6.1 depends on this and gets it wrong if
  you compare whole columns.
- **`heartbeat` is a plain timestamp**, self-reported on each poll tick. Health is derived, not stored:
  the server computes `isHealthy` as `heartbeat > now() - (pollInterval * 3)`. Do not add an `isHealthy`
  column — there are already three divergent client-side staleness rules in this codebase and a fourth
  would be worse.
- **`agent_vault_proxies` has no `orgId`, and Phase 2 needs one.** `$loadResource` in the
  `resource-auth-method` framework returns `{ id, name, orgId, identityId }` and `loginWithToken`
  refuses a null `orgId` (§2.1). Resolve it by joining `projects`, not by denormalising a column —
  noted here so the Phase 1 table does not look under-specified later.
- **`encryptedCredential` nullability is enforced in the service**, not by a CHECK, because the rule is
  "NULL exactly when `credentialType = 'passthrough'`" and a CHECK spanning two columns is harder to
  evolve when the deferred credential types land. The service rejects a missing secret on `bearer` and
  `basic` at write.

**The two `rootCa*` columns are a registry, not a trust anchor** (settled 2026-09-02: the plan
originally had three). Since §4.1 has the agent fetch the CA from the proxy's own listener, nothing ever
verifies against a stored copy — so **the certificate itself is not stored**, because it would have no
reader. The two derived facts do earn their place: `rootCaFingerprint` is displayed on the Proxies page
and is the only place someone gets a value to pin, and `rootCaExpiresAt` shows a CA aging out. Both are
also what makes CA rotation auditable (§1.9's `proxy-enroll`).

The proxy still **sends** its certificate at enrollment, and `/proxy/enroll` still validates it is a real
CA and not expired before deriving the two values. Parse them **once there**, so no read path ever parses
a certificate. Both are overwritten together on re-enrollment, so they cannot drift apart.

There is consequently **no `GET /proxies/:proxyId/ca`**. An operator who needs the PEM for out-of-band
setup fetches it from the proxy, which serves it unauthenticated on its own listener.

The practical consequence: **the CA path has no runtime dependency on Infisical.** With the control
plane down, a proxy still serves its own CA and an agent with a cached session still works.

Altered: `resource_auth_methods` gains `agentVaultProxyId uuid null FK CASCADE` plus a partial unique
index, copying `20260603120000_kmip-server-resource-auth.ts:39-42`:

```sql
CREATE UNIQUE INDEX one_method_per_agent_vault_proxy
ON resource_auth_methods ("agentVaultProxyId") WHERE "agentVaultProxyId" IS NOT NULL
```

Review-blocking conventions: `knex.fn.uuid()` PKs, `createOnUpdateTrigger` wherever `updatedAt` exists,
named CHECK constraints via `knex.raw` (Knex has no builder for multi-column CHECK — see
`20260720183403_pam-account-dependencies-rework.ts`), **every FK indexed**, no pg enums.

The three settings columns on `agent_vault_proxies` are the v2 delta; they used to be start flags.

### 1.3 Permissions

Three subjects, two roles, no org-admin fallback.

```
AgentVaultAccessBundles   read · create · edit · delete · manage-members
AgentVaultSessions        read · create · revoke
AgentVaultProxies         read · create · edit · delete · revoke
```

`AgentVaultProxies.revoke` is not in v2's list and has to be — see §2.2. `resource-auth-method` already
models `revoke` as a distinct intent (`revokeAccess`, `:952`), and without the action there is no
capability to gate the kill switch on.

- Subjects go in `ee/services/permission/project-permission.ts` — the `ProjectPermissionSub` enum
  (`:316`) **and** an arm each in the `ProjectPermissionV2Schema` discriminated union (`:1706`), which
  is what validates custom-role permission payloads. A subject missing from the union cannot be granted
  through a custom role, silently.
- After adding them, re-run `folder-scoped-privilege-rules.test.ts`. It enumerates
  `ProjectPermissionV2Schema` and fails when a new **secretPath-capable** subject appears, forcing a
  human to extend `FOLDER_SCOPED_DENY_RULES`. Ours carry no `secretPath` condition so it should stay
  green, but the test is deliberately literal and is the kind of thing that surprises you in CI.
- Add `agentVaultProjectAdminPermissions` and `agentVaultProjectMemberPermissions` to
  `default-roles.ts`. **Write the admin set out explicitly** (correction 2) or the Agent Vault admin
  silently gets Cmek rotate, ServiceTokens CRUD and SecretSyncs. Roughly: the three Agent Vault
  subjects plus `Member`, `Groups`, `Identity`, `Role`, `Settings`, `Project` and **`AuditLogs`** (§3.2
  depends on that last one). Nothing secret-manager-shaped. The member set stays small, as
  `buildPamProjectMemberPermissionRules` (`default-roles.ts:770-778`) is three read rules: read on
  `Member` / `Groups` / `Identity`, plus `AgentVaultAccessBundles.read`,
  `AgentVaultSessions.read|create|revoke` **and `AgentVaultProxies.read`**.
- **Members need `AgentVaultProxies.read`.** The Proxies page is where a fingerprint comes from, and
  §4.1 makes pinning an opt-in any member can want; gated on admin, a member could never pin at all.
  `read` means name, health and `rootCaFingerprint`; create, edit, delete, revoke and the enrollment
  token stay admin-only. (This was also the justification for `GET /proxies/:proxyId/ca`, which no
  longer exists — the page justification stands on its own.)
- Dispatch arm in `buildProjectPermissionRules` (`permission-service.ts:151`).
- Anything not `admin` — including `custom`, which is how additional privileges arrive — resolves to
  the member set, so a custom role cannot reintroduce project-level power.
- **Reachability is a service-layer filter, not a CASL condition.** Conditions interpolate only
  `identity.id`, `username` and `metadata`. Copy the shape of `pam/pam-permission.ts`'s
  `getResourceIdsWithActions`: query `agent_vault_access_bundle_members` for the actor plus their
  groups, return an id array, `whereIn` it.
- **Group expansion is two subqueries branching on actor type, not one.**
  `membership-dal.ts:36-55` is the model: `user_group_membership` keyed on `userId` for a person,
  `identity_group_membership` keyed on `identityId` for a machine. A machine identity in a group must
  inherit that group's bundles exactly as a user does, and the naive `user_group_membership`-only
  version denies every machine identity's group grants **silently** — no error, just an empty bundle
  list on a session that looks healthy. Machine identities are the primary actor for this product, so
  this is the single easiest way to ship it broken.

**Do not make `projectType` required** on `buildProjectPermissionRules` as the doc suggests. It is a
correct diagnosis of a real 8-site bug, but fixing it changes PAM behaviour on paths Agent Vault never
touches. Thread the type explicitly at our own call sites and file the 8-site fix separately.

### 1.4 Membership cleanup

`agent_vault_access_bundle_members` is our own table, so the shared reaper does not see it.

`services/membership/application-membership-cleanup-service.ts` deletes `RESOURCE_SCOPE` membership
rows when an actor leaves a project, from **five calls across four files**:
`membership-user-service.ts:609`, `membership-identity-service.ts:431`,
`membership-group-service.ts:424`, and `project-membership-service.ts:423` **and** `:542`. Note `:423`
calls the bulk `cleanupUsersApplicationMemberships` while the others call the single-actor
`cleanupActorApplicationMemberships`, so our service needs **both shapes**.

Wire an `agentVaultMembershipCleanupService` into all five, **inside the same transaction**, passing
`tx`. Skip it and a user removed from the project keeps a live grant the mint path still honours.

This is the price of the join table, chosen deliberately: resource-scoped memberships are invisible to
`getResourceMembership`, which INNER JOINs `membership_roles` (`permission-dal.ts:430`), and our grants
carry no role. The cost is five call sites, not a redesign.

### 1.5 Credentials at rest

`kmsService.createCipherPairWithDataKey({ type: KmsDataKey.SecretManager, projectId })`, as
`pam-account-service.ts:167` does. Project scope, not org scope: org scope has no cache and costs three
DB queries every time. **Build the cipher pair once per resolve**, not once per credential.

| Type | `credentialConfig` (plaintext jsonb) | `encryptedCredential` (KMS bytea) | On the wire |
| --- | --- | --- | --- |
| `bearer` | `headerName` default `"Authorization"`, `headerPrefix` default `"Bearer"` | `{ "value": … }` | `<headerName>: <headerPrefix> <value>`, single space, omitted entirely when the prefix is empty |
| `basic` | `username` | `{ "password": … }` | `Authorization: Basic base64(username + ":" + password)` |
| `passthrough` | `{}` | NULL | nothing added |

Three behaviours the table does not carry, all of which someone will otherwise decide differently:

- **An existing header on the agent's request is overwritten, silently.** The agent is expected to send
  a placeholder or nothing; if it sends a real `Authorization`, ours replaces it. Not an error — the
  whole point is that the agent's value is fake. Worth one line in the docs, because it is the first
  thing a developer debugging a 401 will suspect.
- **`headerPrefix` is stored exactly as typed**, without a trailing space. The proxy joins prefix and
  value with one space and skips the space when the prefix is `""`. That is how `DD-API-KEY: abc123`
  comes out right while `Authorization: Bearer abc123` also does.
- **`credentialConfig` is validated per type by one zod schema each**, and the same definition drives
  the frontend form fields — so adding the deferred types later is a config entry, not new form code.

The secret is **required on write** for `bearer` and `basic`, so there is no half-configured state and
no refusal path in the proxy. The discriminator is a column, not a field inside the blob — PAM put it
inside and now needs `withLegacyAuthMethod` and `normalizeCredentialAuthMethod` to cope.

### 1.6 Host pattern grammar

`proxied-service-schemas.ts` exports `hostPatternSchema` with a 245-line test file, handling
comma-separated segments, `*.` single-label wildcards, bracketed IPv6 and ports.

**Copy it into `agent-vault/agent-vault-schemas.ts` and tighten it.** Do not import it — the old module
must stay independently deletable. Two changes:

- **Reject paths.** Note the existing schema is a `superRefine`, not a transform: it *ignores* the path
  when validating and stores the pattern with the path intact, which is why the Go matcher has a live
  `path` field (`match.go:22-25`). We must fail the parse, because the matcher compares the decoded path
  while the upstream gets the escaped one, so `/v1/safe/../../admin` matches a `/v1/safe` pattern and
  collects the credential. `%2f` does the same.
- **Default a portless pattern to 443.** Today an empty port skips the check, so plaintext port 80
  matches and the credential goes out unencrypted. An explicit port stays allowed, `:80` included,
  because some internal APIs sit behind a non-443 TLS port — so the default alone does not close the
  hole. The proxy must also refuse to inject on any upstream it did not reach over TLS, whatever the
  pattern says. Invariant #6 tests both halves.

Copy the test file and add cases for both.

**Keep the two grammars in sync with a fixture, not a comment.** The existing schema carries
`// matching grammar lives in the agent-proxy CLI (packages/agentproxy/match.go); keep the two in sync`.
Ship a shared JSON fixture of pattern/host/expected triples read by both the Vitest and the Go test.

**A wildcard is the leftmost label only, and matches exactly one label.** `match.go:76` is explicit:
`// wildcard matches exactly one extra label: api.github.com yes, a.b.github.com no`. **This is
load-bearing, not a syntax preference** — see §1.6.1. Allowing a mid-label glob (`api-*.foo.com`) or a
second wildcard would silently destroy write-time conflict detection. Note we differ from Claude Tag
here, whose wildcard "covers subdomains at any depth."

### 1.6.1 Conflict resolution

Two connections in one session can match the same host. This is the least-specified part of the
original design, so it is worked out here in full.

**Overlap is fully decidable, always.** Because a wildcard can only be the leftmost label and matches
exactly one label, any two normalised patterns stand in exactly one of three relations:

| Pair | Relation | Consequence |
| --- | --- | --- |
| `api.foo.com` vs `api.foo.com` | **identical** | a genuine tie — no tiebreak exists within a bundle |
| `api.foo.com` vs `*.foo.com` | **contained** | exact wins; a broad wildcard with a narrow override is a useful, deterministic pattern |
| `*.foo.com` vs `*.bar.foo.com` | **disjoint** | the second is four labels, the first matches only three |
| `api.foo.com:443` vs `api.foo.com:8443` | **disjoint** | ports are concrete once portless defaults to 443 |

**Never partially overlapping.** `AGENT_VAULT.md` §6.2 says "overlapping wildcards are not decidable in
general, so step 3 stays the backstop rather than a validation error." That is true of general globs and
false of this grammar. `position` is therefore **not** a backstop for undecidable overlap; it is only
needed for genuinely identical patterns across bundles.

**Write-time validation** (settled 2026-09-02):

- **Reject** a connection that shares **any single normalised `host:port` pattern** with another
  connection in the **same bundle**. Error names both connections and the specific overlapping pattern:
  *"`datadog-eu` already covers `api.datadoghq.com:443` in this bundle."*

  **This is an intersection test, not a set-equality test, and the difference is a real bug if you get
  it wrong.** `hostPattern` holds a comma-separated *set* (§1.6), so equality would let
  `{api.foo.com, api.bar.com}` and `{api.foo.com}` coexist in one bundle. At runtime both match
  `api.foo.com` exactly, both sit in the same bundle so `position` is identical, and the name tiebreak
  fires — the rung the ladder below calls unreachable. Expand each connection to its individual
  patterns and reject on a non-empty intersection.
- The same expansion applies to the cross-bundle warning and to §3.5's mint-time warning. Always compare
  pattern-by-pattern, never set-to-set.
- **Allow containment.** Exact-beats-wildcard is deterministic and is how you write an override. Note
  the cross-bundle consequence: an exact pattern in a *later* bundle beats a wildcard in an *earlier*
  one, because rung 1 of the ladder sits above rung 2. §3.5 has the dialog copy say so.
- **Warn, do not block, across bundles.** Blocking would let one bundle veto another, and `position`
  resolves it. Note the doc's stated reason for not detecting this — "two admins may own different
  bundles and cannot see each other's" — is **false in our model**: there is one admin role per project
  and an admin reaches every bundle, so the collision is detectable and worth surfacing.

**Runtime ladder**, in order:

1. **Exact host beats wildcard.**
2. **Lowest `position`** — the order bundles were named at mint.
3. **Connection name**, as a last deterministic resort. With the intersection rule above it is
   genuinely unreachable: two connections can only tie on rungs 1 and 2 if they share a pattern *and*
   sit in the same bundle, which write-time validation now refuses. Keep it anyway, so the matcher is
   total rather than silently depending on the order rows come back from the database — and so a future
   relaxation of the write rule cannot turn into non-determinism on the wire.

Note the ladder **collapsed to one rung** from the inherited three. `match.go` ranks exact-host, then
specific-port, then longest path. Paths are gone, and defaulting portless to 443 means no pattern ever
has an unspecified port, so the middle rung can never fire either. Far more traffic reaches the
tiebreak than the original design assumed, which is why `position` has to be surfaced (§3.5) rather than
left implicit.

**No fallback.** If the winning connection's credential comes back `401` or `403`, the proxy does
**not** retry with the next matching connection. One host, one credential, one attempt. Claude Tag
states the same rule explicitly; ours was only implied, and someone would eventually have built the
retry.

**Prior art.** Claude Tag has the same two unsolved cases and solves neither: two connections in one
bundle, and two bundles at the same scope. Its scope hierarchy (channel ⊂ workspace ⊂ org) only
resolves the third case, which we do not have. Where structure runs out its docs say "avoid binding
overlapping credentials at the same scope; if you can't predict which key acts, neither can a security
review," and its UI offers no ordering and no enable/disable — connections are evaluated by a priority the
admin cannot set, and the row menu is Edit, Rotate secret, Delete. We are ahead on the cross-bundle case, since `position` is caller-controlled and
deterministic where theirs is neither.

### 1.7 Module layout and routers

```
backend/src/ee/services/
  agent-vault/                 shared enums, permission helpers, host grammar, CLAUDE.md
  agent-vault-access-bundle/   bundles + connections + credential encryption
  agent-vault-member/          the join table + the cleanup service
  agent-vault-session/         mint, revoke, expiry sweep
  agent-vault-proxy/           registration, enrollment, heartbeat, settings, resolve  [Phase 2]
  agent-vault-project/         bootstrap + resolver
backend/src/ee/routes/v1/agent-vault-routers/index.ts
```

`await server.register(registerAgentVaultRouters, { prefix: "/agent-vault" })` in
`ee/routes/v1/index.ts`, beside PAM's line 204. DI wiring in `server/routes/index.ts`: DAL block,
service block, then the `server.decorate("services", {...})` object. Narrow every dep with `Pick<>`;
instantiation order there is dependency-sensitive, not alphabetical.

```
GET|POST         /access-bundles
GET|PATCH|DELETE /access-bundles/:accessBundleId
POST             /access-bundles/:accessBundleId/connections
PATCH|DELETE     /access-bundles/:accessBundleId/connections/:connectionId
GET|POST         /access-bundles/:accessBundleId/members
DELETE           /access-bundles/:accessBundleId/members/:memberId
POST|GET         /sessions
POST             /sessions/:sessionId/revoke
GET              /project                                   internal, hide: true
```

#### Wire contracts

Enough to stop two engineers building two different APIs. Everything is wrapped in a named key per
`CODE_QUALITY.md`, and every response is built with `.pick()`.

```jsonc
// GET /access-bundles              — the list page. A member sees only what they can reach
← 200 { "accessBundles": [ { "id", "name", "description",
                             "connectionCount", "memberCount",   // for the list row
                             "hostPatterns": ["api.us5.datadoghq.com:443", …],  // drives the icon stack
                             "createdAt" } ] }

// GET /access-bundles/:accessBundleId — the detail page, one round trip
← 200 { "accessBundle": { "id", "name", "description",
          "connections": [ { "id", "name", "hostPattern",
                             "credential": { "type", "headerName"?, "headerPrefix"?, "username"? } } ],
          "members": [ … ] } }        // members omitted entirely for a non-admin
← 404 not in the caller's org, **or** a member who cannot reach it. Never 403 — no existence oracle

// POST /access-bundles/:accessBundleId/connections
→ { "name": "datadog-us5",
    "hostPattern": "api.us5.datadoghq.com:443, api.datadoghq.eu:443",
    "credential": { "type": "bearer", "headerName": "DD-API-KEY",
                    "headerPrefix": "", "value": "abc123…" } }
← 200 { "connection": { "id", "accessBundleId", "name", "hostPattern",
                        "credential": { "type": "bearer", "headerName", "headerPrefix" } },
        "warnings": [ { "connectionName", "accessBundleName", "patterns": [ … ] } ] }
// the secret is never echoed. PATCH takes the same body, all fields optional;
// an omitted `credential` keeps the stored secret, an empty one is rejected.

// POST /access-bundles/:accessBundleId/members — exactly one of the three ids
→ { "groupId": "g1-2b3c-…" }
← 200 { "member": { "id", "accessBundleId", "userId"|null, "identityId"|null, "groupId"|null, "createdAt" } }
// The inserted row and nothing more, exactly as PAM and the generic member add return it. Not decorated
// with a name: re-reading the list to decorate went to the replica and could miss the row just written.
// GET …/members returns raw `user { username, email, firstName, lastName }`, `identity { name }` and
// `group { name }` — the frontend owns the display rule ("First Last", else username, else email), as
// PamAccessControlPage/MembersTab.tsx:97 already does. Settled in review, 2026-09-02.
← 400 zero or more than one id supplied
← 409 already a member
// the actor must already be a member of the Agent Vault project — validate on add, or the
// grant silently does nothing. DELETE …/members/:memberId → 200 { member: { id } }.

// POST /sessions
→ { "accessBundleIds": ["b7f3a1c2-…", "b8c4d2e3-…"], "ttl": "7d" }
← 200 { "session": { "id", "token": "agv_9k2…",        // returned exactly once
                     "expiresAt": "2026-09-08T04:12:00Z" | null,
                     "accessBundles": [ { "id", "name", "position": 0 } ] } }
← 400  naming the first unreachable bundle, never silently dropping it. Same message whether the id
//     is unknown or merely not granted, so this is not the existence oracle the 404 rule above avoids

// POST /sessions/:sessionId/revoke   → 200 { session: { id, revokedAt } }, idempotent

// GET /access-bundles/:accessBundleId/live-session-count
← 200 { "liveSessionCount": 3 }   // drives the delete confirm (§1.8 point 6). Counts distinct
//     sessions carrying the bundle that are neither revoked nor expired
```

**Status codes match the repo, not this section's first draft.** Every write returns **200** with the
resource, and a delete returns the deleted object rather than 204 — that is what PAM, cert manager and
every other product router here do, and a lone 201/204 island would be the deviation. Written down
because the shapes above originally said 201 and 204.

Rules the shapes do not carry:

- **`accessBundleIds` are uuids, in caller order** — that order becomes `position`, 0-based. Minimum
  one, maximum 16, duplicates rejected rather than deduped (silently accepting them would make
  `position` ambiguous). The CLI's `--access-bundle` takes *slugs* and resolves them via
  `GET /access-bundles` before minting; there is deliberately no lookup-by-name route.
- **`ttl` is one of `1h` `8h` `24h` `7d` `never`**, default `7d`, exactly as the design doc settles it.
  Not a free-form duration and not seconds. `never` stores `expiresAt = NULL` and is allowed for every
  member with no project cap — a deliberate decision whose risk is stated in §1.8.
- **The actor is always the caller.** No minting on someone else's behalf; `userId` / `identityId` come
  from `req.permission`, never the body.
- **An admin skips the reachability filter at mint**, symmetrically with resolve (§1.8 step 2), because
  an admin reaches every bundle.
- **Revoke is owner-or-admin.** `AgentVaultSessions.revoke` alone is not sufficient — the service also
  checks the session's actor matches the caller unless they are an admin. Without that check any member
  could revoke any other member's live session, which the CASL action on its own does permit.
- **`GET /sessions`** takes `scope=mine|all` (default `mine`, `all` is admin-only, checked in the
  service), `status=active|revoked|expired` derived from the two columns, and `limit`/`offset`
  (20 default, 100 max). Each row carries a pre-rendered **`actorName`** (`identityName ?? userUsername`),
  not a nested user or identity object — the frontend has no display rule to apply here. There is no
  server-side search parameter.
- **Auth modes**: every human route is `verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN])`.
  **Not `AuthMode.OAUTH`** — `backend/CLAUDE.md` closes delegated tokens to administration writes, and
  bundle, member and proxy management are administration. `GET /project` may add OAUTH, as PAM's does.
- **Rate limits**: `readLimit` on reads, `writeLimit` on writes. The proxy routes are the exception,
  see §2.2.

**Two REST deviations to confirm rather than implement silently**, per `CODE_QUALITY.md`:

- **A `GET` bootstraps the project.** The `preValidation` hook creates it on first access and runs on
  every route, so `GET /agent-vault/project` mutates. PAM does exactly this and it is the point of lazy
  bootstrap. Recommend keeping it with a comment on the hook saying so.
- ~~`GET /proxies/:proxyId/ca`~~ — **resolved by deleting the route** (settled with the product owner,
  2026-09-02). The question was whether it should be readable by "any org member" as the doc said, or
  "any project member" as the routing could actually express. Asking it surfaced the better question:
  §4.1 already has every path fetch the CA from the proxy's own unauthenticated listener, so the route
  was never on the trust path and the stored PEM had no reader. Both are gone; the fingerprint and
  expiry stay, so pinning, expiry warnings and the rotation audit trail all survive.

Non-negotiable on every route: `config.rateLimit`, a narrow `onRequest: verifyAuth([...])`, an
`operationId`, a `tags: [ApiDocsTags.AgentVault*]` entry added to the enum at
`lib/api-docs/constants.ts:22` (PAM has seven), a `.describe()` on every field with strings in
`src/lib/api-docs/`, bounded and trimmed
inputs (`slugSchema({ max: 64 })`, never bare `z.string()`), response schemas built with **`.pick()`,
never `.omit()`**, and a cross-org id returning **404, not 403**.

### 1.8 Sessions — the token, and how revocation actually lands

`agv_` + 32 random bytes base64url. Stored as sha256 hex with a unique index; **the token is never
stored** and is returned exactly once at mint. Follows the `resource_token_auths` convention: bcrypt is
for when you already know which row to check, sha256 for when the token value *is* the lookup key.

Not a JWT. A JWT buys zero DB reads because resolve must hit the DB anyway to expand bundles and
decrypt credentials, so it would cost stale scope and a revocation-marker subsystem for nothing.

**The bundle set is a ceiling fixed at mint, intersected with live reachability on every resolve.** It
can shrink, never grow. This resolves the v2 contradiction (correction 6), and it is the single most
important behaviour in the product, so here is exactly what makes it true:

1. **Mint** validates every requested bundle against the caller's current reachability and writes the
   accepted ones to `agent_vault_session_access_bundles` with their `position`. Naming a bundle you
   cannot reach fails with that bundle named — it is never silently dropped. This table is the ceiling
   and is never added to afterwards.
2. **Resolve** does not read that table alone. Its query is the **intersection**:

   ```
   session_access_bundles  →  access_bundles  →  access_bundle_members
       filtered by the session's actor and the groups that actor is in right now
   ```

   so a grant that no longer exists contributes no connections. Admins skip the member filter, because
   an admin reaches every bundle.
3. **The role is re-derived at resolve, never trusted from mint.** An admin who minted a session over
   every bundle and is then demoted to member must lose everything they were not explicitly granted. If
   resolve caches "this actor was an admin," that demotion never lands.
   **Pass `actorAuthMethod: null`, explicitly.** `getProjectPermission` runs `validateOrgSSO`, which
   throws `UnauthorizedError` the moment `actorAuthMethod === undefined` (`permission-fns.ts:282-284`)
   but passes cleanly on `null`. The session row stores no auth method, so leaving the field off 401s
   every user-minted session in an SSO-enforced org — and only in such an org, so it will pass local
   testing.
4. **Nothing caches authorization anywhere.** The proxy caches the *result* for one poll interval and
   re-calls resolve on every tick, so the worst-case staleness is one interval and there is no second
   place to invalidate.
5. **Removal from the project** deletes the actor's `access_bundle_members` rows via §1.4, so the
   intersection empties by the same mechanism. **Deleting the actor** cascades the session rows away
   entirely and the next resolve 404s.
6. **A deleted access bundle** nulls `accessBundleId` while `accessBundleName` survives, so the session
   row still reads on the Sessions page. Resolve treats a null id as contributing zero connections —
   specify this explicitly, and have the bundle-delete confirm say how many live sessions carry it
   (the join table is exactly what makes that answerable).
7. **Invariant #9 in the verification table is the test**, and it is not optional.

The failure mode if any of this is wrong is a session that keeps brokering production credentials for
someone whose access was revoked, so it gets an e2e test rather than a unit test.

**This query is the hot path**, and choosing the intersection over a mint-time snapshot is what puts it
there: it runs once per active session per poll interval, so a thousand live sessions at 60s is ~17
resolves/second, each doing a four-table join plus group expansion plus a KMS decrypt. Three things
keep that affordable, and all three are already in the plan for other reasons — the three actor indexes plus the bundle index
on `agent_vault_access_bundle_members` (§1.2), one cipher pair per resolve rather than per credential
(§1.5), and the proxy's own cache so this is per-poll and not per-request (§2.5). Read it on the
replica (`db.replicaNode()`), and hold no transaction open across the decrypt. Replica lag adds to the
one-interval staleness promise; it is normally sub-second and accepted, but if revocation ever has to
land in exactly one poll interval, this is the read to move to the primary.

**Expiry needs no new cron.** `expiresAt NULL` means never, and expiry is already enforced three ways
without a sweep: the proxy expires its own cache entry locally, resolve 401s, and session status is
derived at read time from `revokedAt` / `expiresAt` (`AGENT_VAULT.md` §5.2 is explicit that nothing else
is stored, so a read path never writes; the one exception is the `lastResolvedHash` audit hint in §1.9). The only thing a sweep buys is the `session-expire` audit
event.

So **[Phase 4]** **fold expiry and retention into the existing `CronJobName.DailyResourceCleanup`**
(`services/resource-cleanup/resource-cleanup-queue.ts:83`) rather than registering a new job. A new
`CronJobName` would also need its own alarm in the infrastructure repo, which `backend/CLAUDE.md`
requires with no exception — worth avoiding for a once-a-day reap. Whichever way it goes, use the cron
manager and **not** a BullMQ repeatable: `queueServiceFactory` actively cleans up stale repeatables on
boot, and re-introducing one causes double execution.

**Retention: hard-delete 30 days past `expiresAt` or `revokedAt`, whichever applies.** Expired and
revoked rows are otherwise never deleted, so `agent_vault_sessions` and its child table grow without
bound on a busy org and `GET /sessions` gets slower forever. Thirty days keeps a month of history on the
Sessions page for anyone reconstructing an incident, and unlike PAM sessions there is no recording or
activity stream that has to outlive the row. The child table follows by CASCADE. A `never` session
(`expiresAt IS NULL`) is only ever reaped after it is revoked. This is why §1.2 puts partial indexes on
`expiresAt` and `revokedAt`.

**One risk to note rather than fix:** `never` is allowed for every member, with no project cap, and `AgentVaultSessions.create` is on the member role. So any member can mint a permanent
bearer token that causes a proxy to attach production credentials. That is a deliberate decision, but
the Sessions list should make non-expiring sessions visually obvious, and it is the first thing to
revisit if it bites.

### 1.9 Audit events

Each event costs 3 edits in `audit-log-types.ts` (enum member, interface, union arm) plus the emit
call. Emit **at the router layer**, as `pam-account-router.ts:145-159` does, not in the service.

**The proxy actor costs four more, on top of the per-event three.** A new actor type needs an
`AgentVaultProxyActorMetadata` interface, an `AgentVaultProxyActor` interface, and an arm in **two**
separate `Actor` unions (`audit-log-types.ts:93-100` and `:1073-1086`). Without them the
`server/plugins/audit-log.ts` arm from §2.1 does not type-check, so this lands with that one or not at
all.

**Phase 1** — 10 events:
`access-bundle-create`, `access-bundle-update`, `access-bundle-delete`,
`connection-create`, `connection-update`, `connection-delete`,
`member-add`, `member-remove`,
`session-mint`, `session-revoke`. `session-expire` lands with the retention sweep in Phase 4.

**Phase 2** — 7 more:
`session-resolve` (the privileged read, see below),
`proxy-register`, `proxy-token-reissue`, `proxy-enroll`, `proxy-update`, `proxy-revoke`,
`proxy-delete`. (`ca-root-read` is gone with the route it audited — settled 2026-09-02.)

`proxy-revoke` is not in the earlier review doc; it arrives with the revoke route in §2.6. What each
records: `connection-*` never carries the secret, only whether it was replaced. `proxy-enroll` records
the submitted CA fingerprint and whether it replaced an existing one — that is the audit trail for CA
rotation. `session-expire` has no human actor.

**`session-resolve` must not be one audit row per poll.** v2 lists it as "the privileged read," which is
right, but at a 60s poll one active session writes ~1,440 rows/day and a hundred sessions write 144k/day
into the partitioned audit table and into every customer's audit stream. Gateway's equivalent liveness
call is deliberately not audited. Emit `session-resolve` **on a session's first resolve and whenever the
returned connection set changes**, and make the steady-state poll a structured log line.

Detecting a change needs the previous set. Add a nullable `lastResolvedHash varchar(64)` to
`agent_vault_sessions` (sha256 of the ordered connection ids), written only when it differs from the
value just computed. This is the one deliberate exception to §1.8's rule that a read path never writes:
it is an audit hint, not authorization state, and nothing reads it but this comparison.

Put `accessBundleId` in the metadata of every bundle-scoped event, for the audit filter UX.

**No audit-log scope resolver is needed.** PAM has `pamAuditLogScopeResolverFactory`
(`pam/pam-audit-log-fns.ts`, wired at `server/routes/index.ts:1133`) because a PAM member can hold
partial folder-scoped `ViewAuditLogs` grants CASL cannot express. Agent Vault's Audit Logs page is
admin-only, so there is no partial visibility to compute, and `audit-log-service.ts:76` falls through to
the standard `getProjectPermission` + `AuditLogs` check when the resolver returns null.

### Phase 1 checklist

Tick in this file and commit at each line. Ordered so every checkpoint leaves a tree that type-checks.

- [x] `AgentVault` in both `ProjectType` enums, six `TableName` entries, bootstrap + resolver + `preValidation` hook, eager bootstrap at org and sub-org create, `agentVaultProjectId` on the org payload (backend and frontend type)
- [x] Generic-create block, delete block, billable-count exclusion, `requestProjectAccess` arm, keystore prefix, the rest of the `ProjectType.PAM` grep except the three **[Phase 4]** items
- [x] Migration for the six tables and the `resource_auth_methods` column, `generate:schema` run, `folder-scoped-privilege-rules.test.ts` still green
- [x] Three subjects in `ProjectPermissionSub` and the V2 union, explicit admin and member sets, dispatch arm, five frontend type maps in §3.1 updated so `type:check` passes
- [x] `agent-vault/` shared module: host grammar copied and tightened, shared pattern fixture, conflict detection (intersection, not equality)
- [x] `agent-vault-access-bundle/` + `agent-vault-member/`: DAL, service, credential encryption, routers, cleanup service wired into all five call sites
- [x] `agent-vault-session/`: mint with reachability + `position`, revoke owner-or-admin, `GET /sessions` scope and status filters
- [x] Ten Phase 1 audit events, `ApiDocsTags`, `.describe()` strings, e2e specs for invariants 1, 3, 11, 13, `agent-vault/CLAUDE.md` started, Progress row updated

---

## Phase 2 — Backend proxy endpoints + `av proxy`

The first phase where traffic flows. Backend and CLI land together because they are one contract.

### 2.1 Proxy token — and the one place the framework does not fit

`ee/services/resource-auth-method/` already does enrollment, `tokenVersion` revocation and non-expiring
JWTs for gateway, relay and KMIP. This answers v2's "TODO: check how gateway does this first," and the
framework gives us v2's exact semantics for free: enrollment tokens are sha256, 1h TTL, single-use and
deleted in-transaction; `loginWithToken` **bumps `tokenVersion` on enroll**; minting a replacement
enrollment token **does not** (`resource-auth-method-service.ts:909`). That is precisely v2's "bumps on
enroll, not on reissue, so the old instance keeps serving until the replacement comes up."

**But `$checkPermission` (`:200-223`) is org-scoped and ours is not.** The framework authorizes every
operation with `permissionService.getOrgPermission` against `OrgPermissionSubjects.{Gateway,Relay,KmipServer}`,
and `$loadResource` returns `{ id, name, orgId, identityId }` with no `projectId` to check against.
`AgentVaultProxies` is a **project** subject (§1.3). Three ways out:

**`$checkPermission` needs an arm whatever we decide, because its `else` is the KMIP branch.** A fourth
`ResourceRef` type falls straight through to
`throwUnlessCan(OrgPermissionKmipServerActions.EditKmipServers, OrgPermissionSubjects.KmipServer)` —
the same silent fall-through class as `$loadResource`, except this one re-introduces the org-admin
fallback §1.3 forbids. So it goes in the edit table below regardless of which option we pick.

**And most of the framework is closure-private.** `$checkPermission` (`:200`), `$bumpTokenVersion`,
`$mintJwt`, `$registryFilter`, `$loadResource` and `$generateEnrollmentToken` (`:75`) are none of them
on the factory's return (`:1220-1236`), and `$checkPermission` is called *inside* `mintToken` (`:912`),
`setMethod` (`:711`) and `revokeAccess` (`:952`). "Own the check outside and reuse the internals" is
therefore not available: the inner check still runs, and the internals are not reachable.

What **is** reusable from outside is exactly two methods, both of which take no permission check of
their own and both of which need the arms listed below: `initAtCreate` (`:657`) and `loginWithToken`
(`:1156`) — which is the whole enroll path, the part that matters most.

| Option | Verdict |
| --- | --- |
| Make `AgentVaultProxies` an org subject | Rejected. Contradicts "no org-admin fallback" and moves proxy management outside the Agent Vault admin role |
| Own the check outside; reuse the internals | **Not possible.** See above — the internals are private and the inner check still fires |
| **Add an Agent Vault arm to `$checkPermission` that calls `getProjectPermission`** | **Chosen**, and it is a reduced form of the second option above. It needs `orgId` on the resource, which our table lacks: `$loadResource`'s fourth arm joins `projects` to supply it (§1.2 gives `agent_vault_proxies` only a `projectId`, and the framework wants `orgId` too — see below), and the actor DTO already carries what `getProjectPermission` needs. Scope the change to one new branch in a shared service rather than restructuring it |

**`agent_vault_proxies` needs `orgId` reachable.** `$loadResource` returns `{ id, name, orgId, identityId }`
and `loginWithToken` refuses a null `orgId` before minting. Our table has only `projectId`, so the arm
joins `projects`. §2.2's "the proxy's org must equal the session's org" needs the same value.

Everything else is an enumerable edit:

| Edit | File |
| --- | --- |
| `\| { type: "agentVaultProxy"; id: string }` on `ResourceRef` | `resource-auth-method-fns.ts:83` |
| `RESOURCE_TYPE_AGENT_VAULT_PROXY` + assert helper | same file |
| `mintAgentVaultProxyJwt`, `accessTokenTTL: 0` | same file, copy `mintGatewayJwt` |
| `RESOURCE_LABEL` — exhaustive `Record<ResourceRef["type"], string>` | `resource-auth-method-service.ts:120-124` |
| `$loadResource` — a fourth arm, joining `projects` for `orgId`. **Without it an agent-vault proxy id is loaded as a KMIP server. Silent, not a type error** | `:154-169` |
| **`$checkPermission` — a fourth arm calling `getProjectPermission`.** Same silent fall-through: without it the `else` grants on `OrgPermissionSubjects.KmipServer` | `:200-223` |
| FK column mapping | `:144-148` |
| `$bumpTokenVersion` arm | `:171-187` |
| `$mintJwt` arm | `:190-197` |
| `$generateEnrollmentToken` — add a `prefix` parameter. It hardcodes `gwe_`, and §2.2 wants `avp_` | `:75` |
| `expectedResourceType` union | `resource-auth-method-types.ts:82` |
| Resource-type resolution in `loginWithToken` | `:1174-1186` |

`verify-auth.ts` needs **no** edit — `verifyAuth` is generic over the `AuthMode[]` it is passed
(`verify-auth.ts:26`).

**The auth plugin wiring is seven touchpoints, not one:**

| | |
| --- | --- |
| `AuthTokenType` + `AuthMode` + `ActorType` | `services/auth/auth-type.ts:65-67` |
| `TAgentVaultProxyAccessTokenJwtPayload` | beside `TGatewayAccessTokenJwtPayload` at `auth-type.ts:70` |
| `req.auth` discriminated union | `inject-identity.ts:107-109` |
| `AuthTokenType → {authMode, actor}` switch | `inject-identity.ts:197-202` |
| **`tokenVersion` check** | `inject-identity.ts:437+`, a fourth case beside the three |
| `inject-permission.ts:90-103` | without an arm `req.permission` is never populated, which breaks the `gatewayMetricsReportLimit`-style rate-limit `keyGenerator` (it reads `req.permission.id`) |
| `server/plugins/audit-log.ts:95-117` | the actor chain ends in `throw new BadRequestError("Invalid actor type provided")`, so any audited proxy route 400s until an arm exists — and §1.9 audits `session-resolve` |

**The `tokenVersion` check is the only kill switch, so no proxy route may skip it.**

**Settled:** the reissue endpoint checks **`edit`** on `AgentVaultProxies`, not `create`. The earlier
review doc said `create`; the framework's `mintToken` checks `edit` (`:917`), and since the chosen
option adds our arm inside `$checkPermission` rather than wrapping it, `edit` is what actually runs.
Harmless in practice: an admin holds both, and `create` and `edit` on proxies are never split.

### 2.2 Proxy routes

```
GET              /proxies                              both  (see below)
POST             /proxies                              admin
PATCH|DELETE     /proxies/:proxyId                     admin
POST             /proxies/:proxyId/enrollment-token    admin
POST             /proxies/:proxyId/revoke              admin

POST             /proxy/enroll                         enrollment token
POST             /proxy/heartbeat                      proxy JWT   → returns the settings block
POST             /proxy/resolve                        proxy JWT + X-Infisical-Agent-Session
```

**`GET /proxies` is role-projected, not role-gated.** v2 marks it admin-only, but the Proxies page is
where a member finds a fingerprint to pin (§4.1). Return name, health, `version` and `rootCaFingerprint`
to a member, and add the three settings columns plus `createdAt` for an admin — the same
"one `read` action, the service decides the shape" pattern §1.3 uses for the session list. Do not
expose `bypassHosts` or `unmatchedHost` to a member; they describe the deployment, not the session.

#### Proxy wire contracts

```jsonc
// POST /proxies — register. Phase one of the two-phase create UI
→ { "name": "egress-1",
    "unmatchedHost": "allow", "bypassHosts": null, "pollInterval": 60 }   // all optional, defaults shown
← 201 { "proxy": { "id", "name", "heartbeat": null, "isHealthy": false,
                   "rootCaFingerprint": null, "version": null,
                   "unmatchedHost": "allow", "bypassHosts": null, "pollInterval": 60,
                   "createdAt" },
        "enrollment": { "token": "avp_7k2mfxql4tzb8ncr0jdvhsw3pey5dm2xub",
                        "expiresAt": "2026-09-02T05:40:00Z" } }
// enrollment.token is shown once, is single-use, and its row is deleted in-transaction on use.
// POST /proxies/:proxyId/enrollment-token returns the same `enrollment` object and nothing else —
// it does NOT bump tokenVersion, so the running proxy keeps serving until the replacement enrolls.

// POST /proxy/enroll — the enrollment token is the auth, once
→ { "enrollmentToken": "avp_7k2mf…",
    "rootCaCertificate": "-----BEGIN CERTIFICATE-----\nMIIB…\n-----END CERTIFICATE-----\n" }
← 200 { "proxyId": "8f2c4b81-…",
        "accessToken": "eyJhbGciOi…",            // non-expiring JWT, revoked by tokenVersion
        "config": { "unmatchedHost": "allow", "bypassHosts": null, "pollInterval": 60 } }
← 401 token unknown, already used, or expired
← 400 certificate is not valid PEM, is not a CA, or is already expired
// Validate the PEM BEFORE calling loginWithToken. It deletes the enrollment token in-transaction, so a
// bad certificate checked afterwards would burn the operator's one-time token on a 400.

// POST /proxy/heartbeat — Authorization: Bearer <proxy JWT>
→ { "version": "0.43.1" }                        // proxy build, for the Proxies page. That is all
← 200 { "config": { "unmatchedHost": "deny",
                    "bypassHosts": "*.internal.acme.com,vault.corp:8200",
                    "pollInterval": 60 } }
// side effect: heartbeat = now(). The full settings block comes back every time, unconditionally; §2.4

// POST /proxy/resolve — Authorization: Bearer <proxy JWT>
//                       X-Infisical-Agent-Session: agv_9k2…
→ (no body)
← 200 { "sessionId", "expiresAt": "…" | null,
        "connections": [                          // ordered: bundle position, then connection name
          { "id", "name": "datadog-us5",
            "accessBundleName": "on-call-infrastructure",
            "hostPattern": "api.us5.datadoghq.com:443",
            "credential": { "type": "bearer", "headerName": "DD-API-KEY",
                            "headerPrefix": "", "value": "<plaintext>" } } ] }
← 200 { …, "connections": [] }   valid session, actor lost every bundle. Not an error
← 401 { "message": "Session revoked" }   revoked, expired, **or the actor is no longer a project member**
                                         — proxy drops the entry
← 404 session token unknown, or its org differs from the proxy's
// The membership case matters: getProjectPermission throws a 403 for a removed actor, and the proxy
// treats anything outside 200/401/404 as "Infisical unreachable" and keeps serving through its grace
// window. resolveSession maps ProjectMembershipNotFound to this 401 so removal lands in one poll, not
// five. Found in review, 2026-09-02; verified live.
```

**`resolve` is the only endpoint that decrypts a credential.** Two values, and the distinction matters:
`Authorization: Bearer <proxy JWT>` is the credential and does the authorizing;
`X-Infisical-Agent-Session: agv_…` is a **selector**, not a second factor — one proxy serves many
sessions and only we know which bundles each carries. Header, never a query string.

The proxy's org must equal the session's org, mirroring the relay's `relay.orgId !== token.orgId`, and a
mismatch returns **404** so a proxy cannot probe another tenant for session ids.

- **200 with connections** — live, sorted by `position`
- **200 with `connections: []`** — valid session, actor lost every bundle. Not an error
- **401** — revoked or expired; the proxy drops its cache entry immediately

No `status` field. The 401-vs-timeout split is what lets the proxy tell a dead session (drop now) from
an unreachable Infisical (use the grace window).

**Rate limits: copy `gatewayMetricsReportLimit`'s shape, not its numbers.** Its `keyGenerator`
(`server/config/rateLimiter.ts:46`) is exactly right — `req.permission?.id` with a `req.realIp`
fallback — and we need it, because the `readLimit` / `writeLimit` presets key on source IP and many
proxies behind one NAT would 429 each other. But its ceiling is **`max: 10` per 60s**, and one proxy
serving N sessions makes N resolve calls per poll interval. Copied verbatim, any proxy past ten
concurrent sessions starts failing closed on its own refresh. Size the `resolve` bucket off the 4,096
cache-entry cap, and keep `heartbeat` low since it is genuinely once per tick.

This is also why `inject-permission.ts` needs its arm (§2.1): without it `req.permission` is undefined
and every proxy silently falls back to the shared IP bucket.

### 2.3 What lands when

Every change reaches a running agent on the proxy's next refresh — one poll interval, 60s default. This
is the question every user will ask and it is written down nowhere in the docs:

| Admin does | Running agent sees | How |
| --- | --- | --- |
| Rotates a connection's secret | New credential on the wire, ≤1 poll | Resolve returns the new value |
| Edits a host pattern | New scope, ≤1 poll | Same |
| Removes a member from a bundle | Those connections vanish, ≤1 poll | The §1.8 intersection |
| Deletes an access bundle | Same, ≤1 poll | `accessBundleId` nulls; `accessBundleName` survives so the session still reads |
| Demotes an admin to member | Loses every bundle not explicitly granted, ≤1 poll | Role re-derived at resolve |
| Revokes a session | 401, entry dropped, ≤1 poll | The 401 branch |
| Changes a proxy setting | ≤1 heartbeat; in-flight connections drain | The settings block |
| Adds a bypass host | Next CONNECT; open tunnels unaffected | Evaluated pre-interception |
| Lowers `pollInterval` 300 → 10 | One more 300s tick first | New spacing starts from the next tick |
| Deletes the actor | Sessions cascade, next resolve 404s | Actor FKs are CASCADE |

Say "changes reach running agents within about a minute" in every destructive confirm rather than
implying an instant kill. The mockup's revoke dialog already has the right *framing* — though not its
claim about live sessions, see the divergences above.

### 2.4 Server-owned proxy settings

The v2 delta: `unmatchedHost`, `bypassHosts` and `pollInterval` move from start flags to columns, and
every heartbeat returns the full block unconditionally — three fields on a call the proxy already makes,
so there is nothing worth saving by diffing or versioning.

The proxy swaps its config struct if the values differ, logs the change, and **writes the block to its
data directory**. Without that, a restart during an Infisical outage falls back to the `allow` default
and silently drops a `deny` policy at exactly the moment nobody is watching.

`bypassHosts` is evaluated **first, at CONNECT, before any interception**: no certificate minted, no
credential injected, and the unmatched-host policy never applies. That makes it the escape hatch for
cert-pinning clients.

**A note on the `allow` default, now that it is settled.** With `allow` and an empty `bypassHosts`, the
default deployment terminates TLS on every host the agent touches while permitting everything through —
a lot of interception for no security benefit. Two cheap mitigations, both worth doing: seed a sensible
default `bypassHosts` (package registries and the like) at proxy-create time in the UI, and make the
Proxies page state plainly what `allow` means. Related: **`passthrough` as a credential type earns its
keep only under `deny`.** Under `allow` a passthrough connection differs from doing nothing only in
that TLS is still terminated, which no screen currently explains — say so in the connection sheet.

### 2.5 The Go engine — `packages/agentvault`

A new sibling package. Copy from `packages/agentproxy`, do not import it.

| Copy | From | Change |
| --- | --- | --- |
| Host matching | `match.go` (145) | Drop `path` from `hostPattern` and `matchDetail`; default port 443; replace the lexicographic tiebreak with **slice order**. Keep the single-label wildcard exactly as-is — §1.6.1 depends on it. The ladder reduces to exact-beats-wildcard, then slice order, then name |
| Policy constants | `proxy.go:27-29` | Rename `UnmatchedBlock` → `UnmatchedDeny` in the fork, so the engine, the column, the API and the UI all say `deny` |
| Leaf CA | `ca.go` (288), `local_ca_store.go` (136) | Keep `newLocalCaManager` / `caManagerFromRoot` and the flock'd disk store; **drop the remote-resign path** with the org CA |
| Header injection | `rewrite.go` (210) | Keep `header-rewrite`; **drop `credential-substitution`** with transforms |
| MITM server | `proxy.go` (841) | Keep CONNECT/hijack/tunnel/forward; replace `agentScope` with an opaque session key |
| Session cache | `cache.go` (383) | Keep eviction and TTL mechanics; replace `resolveServices` with a single `resolve` call |

Not copied: `leases.go` (434) — no dynamic secrets; `local.go` (162) — no in-process mode.

**The one refactor, and it is bigger than the doc says.** `serviceResolver` (`proxy.go:95-101`) is
already a two-implementation seam, and replacing `(jwt string, scope agentScope)` with one opaque caller
key makes everything after it additive. But `agentScope` is referenced in **28 non-test places** across
`cache.go`, `leases.go`, `local.go` and `proxy.go`, not the 13 the doc claims — budget accordingly.

Cache entry, keyed by the **sha256 of the session token, never the token** (today the raw JWT is both
the map key and a field in the entry, so a heap dump yields every live credential verbatim):

```
sessionId, expiresAt, lastSeen, fetchedAt,
connections[] { id, name, accessBundleName, hostPatterns (parsed once), credential (DECRYPTED) }
             ordered by (session bundle position, then connection name)
```

Two ordering details the docs leave open. `position` lives on `agent_vault_session_access_bundles`, so
it orders **bundles**, not connections within one. §1.6.1's write-time rule means two connections in the
same bundle can never share a pattern, so this should never decide anything — sort by connection name
anyway, so the matcher is total and never depends on the order rows come back from the database. And carry `accessBundleName` on each
connection: §2.6's `whoami` reports which bundle a host came from, the proxy's decision log wants it,
and resolve is the only place that knows it.

Six things evict. **Credential bytes are deliberately not zeroed** (settled in review, 2026-09-02: the
plan originally asked for zeroing on every eviction path). Zeroing defends only against someone who can
read the proxy's memory, and anyone in that position is on the proxy's box, where the proxy token sits
on disk and resolves every live session's credentials directly. Zeroing in place also raced with
in-flight requests that still held the slice — a refresh could send `\x00` bytes upstream, reproduced
with `go test -race`.

```
idle 10 min             →  drop, stop polling
refresh returns 401     →  drop now       revoked, expired, or lost access
refresh returns 404     →  drop now       the session row is gone (actor deleted)
expiresAt passed        →  drop, no call
4,096 entries           →  idle first, then LRU
shutdown                →  clear
```

**The 404 arm is not optional.** §1.8 and §2.3 both promise "the next resolve 404s" once the actor is
deleted, and §2.2 returns 404 on an org mismatch. A 404 is neither a 401 nor a 5xx, so without its own
arm it falls into the unreachable-Infisical branch and the proxy keeps brokering that session's
credentials for **five more poll intervals** — precisely the case where it should stop soonest.

On an **unreachable** Infisical (timeout or 5xx, as distinct from a 401) keep serving for **five poll
intervals**, then stop. One interval would kill every running agent on a blip; today it serves
indefinitely, which is the worse bug.

Also fix, since both are cheap and currently silent: **block link-local and loopback**
(`169.254.169.254` first) so a shared proxy is not an SSRF pivot, and **log a warning when the
512-connection listener saturates** — today it blocks silently and the agent just hangs.

**The three protocol gaps ship unfixed** (settled). They are inherited wholesale from the copy:

| Gap | Where | Effect |
| --- | --- | --- |
| WebSockets fail | `stripHopByHopHeaders` (`proxy.go:707-728`) deletes `Upgrade`; no 101 handling anywhere | MCP over WebSocket, Slack Socket Mode, OpenAI Realtime, `kubectl exec` |
| Streaming dies at exactly 30 min | `tunnelWriteTimeout` / `plainWriteTimeout` (`proxy.go:32-50`) are absolute `WriteTimeout` deadlines set once at request start, not idle timers | long-lived MCP-over-SSE |
| h2-only clients fail ALPN | `handleConnect` hardcodes `NextProtos: ["http/1.1"]` (`proxy.go:401-405`); the upstream transport sets `ForceAttemptHTTP2: false` deliberately, because h2 responses have no HTTP/1.1 length framing and would hang the re-serialized tunnel | gRPC, Google Cloud SDKs, Temporal |

**Document all three as unsupported in the v1 docs, and make each fail legibly** — an h2-only ALPN offer
should return a clear message rather than a handshake error. The WebSocket fix already exists and passes
on `saif/age2-52-add-websocket-support-for-agent-proxy` in **both** repos, so it is the cheapest of the
three to pick up later.

### 2.6 `av proxy`

Top-level `avCmd` on `RootCmd` (like `gatewayCmd`, `pamCmd`, `relayCmd`), **not** nested under
`secretsCmd`. The existing `secrets agent-proxy` tree is untouched.

```bash
infisical av proxy --enrollment-token avp_7k2mf…   # enroll or re-enroll
infisical av proxy                                  # read persisted state and serve
infisical av proxy --port 18000
```

| Flag | Default |
| --- | --- |
| `--enrollment-token` | one-time, 1h |
| `--data-dir` | `~/.infisical/agent-vault`, or `/etc/infisical/agent-vault` as root |
| `--port` | **`17323`** |
| `--log-format`, `--log-file` | `console`, none |

**`--port` cannot default to 17322.** That is exactly the existing `secrets agent-proxy start` default
(`packages/cmd/agent_proxy.go:487`), the old feature is not being removed, and Phase 4's own
verification runs both on one box. The second one to start would fail to bind.

Traffic policy comes from the server on every poll, so `--unmatched-host` and `--poll-interval` are
**gone** from the CLI. Only what the server cannot know stays: where to bind, where to write, how to log.

Data directory, which must persist because of the CA rather than the enrollment: `ca.key` 0600,
`ca.crt` 0644, the proxy token 0600, the last fetched settings, and the stored enrollment token. Follow
`packages/gateway-v2/enroll.go`'s flat `key=value` conf format and its root-vs-user path split. The
gateway enrollment code does not use viper, and neither should this.

**Enroll first, commit second.** Generate the CA in memory, call `/proxy/enroll`, write to disk only
once the server has answered.

**Re-enrollment on restart: persist and compare, like gateway.** v2 has a stale `--enrollment-token`
fail closed on restart, on the grounds that a leaked spec cannot re-enroll. The cost is that an ordinary
restart breaks: a Kubernetes Deployment holds the token in its spec, and a node drain or OOM kill
becomes a crashloop until a human mints a new token. Gateway already solved this — `gateway.go:364-365`
compares the stored enrollment token and skips enrollment when it matches, saving it at `:388`. Adopt
that, because:

- **v2's intent survives.** A *different* token still re-enrolls from scratch, which is the redeploy and
  rotate story. Only re-passing the same token that already enrolled this box changes behaviour.
- **The fail-closed case v2 cares about survives.** Wipe the data directory and the stored token goes
  with it, so a spent token in a spec finds nothing to compare against, gets 401 and exits with the disk
  untouched.
- **The security cost is near zero.** The stored token is already spent, and it sits in a 0600 directory
  that already holds `ca.key` and the live proxy token.
- **It is what the framework does**, and v2's own decisions table says proxy enrollment follows the
  existing component enrollment framework.

One improvement on gateway's version: it compares **only** the stored enrollment token, so a data
directory holding the token but no access token skips enrollment and then fails to serve. Check both.

**Re-enrolling replaces the CA, and that is the expensive half.** A fresh `ca.key` / `ca.crt` on the box
and new `rootCaCertificate` / `rootCaFingerprint` / `rootCaExpiresAt` on the row. What survives: the
proxy `id`, its name, its three settings, its audit history, and the `resource_auth_methods` row. Keeping the old CA across a rotation would be pointless anyway — the proxy
token and `ca.key` sit in the same directory, so if one leaked, assume both did.

Who notices is narrower than it looks, because the CLI fetches the CA fresh on every run (§4.1).
**On Linux, anyone using `av run` notices nothing** — it refetches. What breaks is anything holding a
*copy*: an explicit `--ca-fingerprint` pin, a k8s Secret mounting the CA, and **a macOS keychain entry,
which `av run` itself created** via `ensureCATrusted`, so macOS users are not exempt. **The re-enrollment
confirm dialog has to name those three**, or the first rotation takes out the pods and none of the
laptops, which is a confusing way to find out.

**The kill switch is a route, not a flag.** v2 describes a `revokeNow` flag on the reissue call for a
believed-leaked token. Nothing named that exists anywhere in the backend, and gateway does it as a
separate endpoint — `POST /:gatewayId/revoke` (`ee/routes/v3/gateway-router.ts:387`) delegating to
`resourceAuthMethod.revokeAccess`, which checks the `revoke` intent. Follow that:
`POST /proxies/:proxyId/revoke` gated on `AgentVaultProxies.revoke` (§1.3, §2.2). Without it, §2.1's
"the `tokenVersion` check is the only kill switch" has nothing to trigger it.

**The proxy serves its own identity and CA unauthenticated on its own listener** — a public certificate
is public:

```
GET http://10.0.1.5:17323/_agent-vault/ca
{ "proxyId": …, "name": …, "certificate": …, "fingerprint": … }
```

**Intercept that path only for origin-form requests addressed to the proxy itself.** The listener's
normal job is forwarding, so a proxied request for `http://example.com/_agent-vault/ca` must reach
`example.com` untouched. Getting it backwards lets the proxy shadow a real path on every host an agent
reaches.

**Add `/_agent-vault/whoami` on the same listener** (session token in, resolved host patterns and bundle
names out, never credential values). With no request stream in v1, this is the only way an operator can
answer "what can this session actually reach" without reading the proxy's stdout. It costs almost
nothing on top of the CA endpoint and it is the difference between a debuggable product and one where
the answer lives in a container log. See §3.5.

Config resolution reuses `util.GetCmdFlagOrEnvWithDefaultValue`. Keep the property that
`util.ResolveAgentProxyAddress` already has: the address is never read from `.infisical.json`, because a
committed file must not redirect traffic.

### Phase 2 checklist

- [x] `resource-auth-method` arms: `ResourceRef`, `RESOURCE_LABEL`, `$loadResource` (joins `projects` for `orgId`), `$checkPermission` (project permission), FK mapping, `$bumpTokenVersion`, `$mintJwt`, `expectedResourceType`, `loginWithToken` resolution, `$generateEnrollmentToken` prefix
- [x] Auth plugin touchpoints: `AuthTokenType` / `AuthMode` / `ActorType`, JWT payload type, `req.auth` union, switch arm, `tokenVersion` check, `inject-permission` arm, `audit-log` actor arm plus the two `Actor` unions in `audit-log-types.ts`
- [x] `agent-vault-proxy/`: register, reissue, update, delete, revoke, `GET /proxies` role-projected. No `GET /proxies/:proxyId/ca` — deleted, see §1.2
- [x] `/proxy/enroll` (PEM validated before `loginWithToken`), `/proxy/heartbeat` returning the settings block, `/proxy/resolve` with the §1.8 intersection, `actorAuthMethod: null`, 401 / 404 / empty-200 semantics, resolve rate limit sized off the cache cap
- [x] Eight Phase 2 audit events; `session-resolve` only on first resolve or a changed `lastResolvedHash`
- [x] `packages/agentvault`: six files copied, `agentScope` replaced by an opaque session key, paths dropped, port 443 default, `UnmatchedDeny`, cache keyed by token hash, six eviction paths zeroing credentials, five-interval grace, 404 arm, link-local block, saturation warning
- [x] `av proxy`: enroll-then-commit, persist-and-compare restart, data directory layout, `/_agent-vault/ca` and `/_agent-vault/whoami` on origin-form only, port 17323
- [x] Go tests reading the shared fixture (39 pass, including the cache's eviction, 404 and grace-window arms). Invariants 2, 5, 6, 9, 10 and 12 are verified live rather than as automated e2e specs — see Progress. **Still to write: automated specs for 4, 7 and 8**, and the `CLAUDE.md` updates

---

## Phase 3 — Frontend

Org-scoped URL over one implicit project, exactly like PAM.

### 3.0 Where the product becomes visible

Everything merges at once, so nothing here gates anything. But it is worth knowing **which three lines
actually make Agent Vault appear**, because they should be the final commit of the whole branch — after the docs in §4.2 — so a
reviewer can see the go-live in one diff.

The exhaustive type maps in §3.1 force entries in `PROJECT_TYPE_PATH`, `PROJECT_NAV_COMPONENT` and
friends, but none of those makes the product *discoverable* — `AgentVaultNav` only renders once you are
already inside it. Three plain arrays do:

| File | Array | Surface |
| --- | --- | --- |
| `ProjectCategoryOverview.tsx:42` | `PRODUCT_TYPES` | org landing tiles |
| `TypeSelect.tsx:24` | `PRODUCT_TYPES` (a *different* array with the same name) | the navbar product switcher |
| `components/auth/signupProducts.ts` | `SIGNUP_PRODUCTS` | the signup product picker |

Note the eager bootstrap has a tail: reverting the merged PR leaves an `agent-vault` project row in
every org that has been touched since. Harmless once §1.1's billable-count exclusion is in — which is
exactly why that exclusion is not optional — but it is not a clean revert, and that is worth saying in
the PR description rather than discovering during a rollback.

### 3.1 Product registration

There is no single registry; PAM is registered in about a dozen places.

| File | Add |
| --- | --- |
| `hooks/api/projects/types.ts` | `ProjectType.AgentVault` |
| `index.css:97-101` | `--color-product-av: #7a7aff;` — see below |
| `helpers/project.ts` | `VALID_PROJECT_SLUGS`, `getProjectBaseURL`, `getProjectHomePage`, `getProjectTitle`, `getProjectDescription`, `getProjectLucideIcon`. **Exclude** from `PROJECT_TYPES_WITH_INTERMEDIATE_VIEW`, as PAM is — single-instance products have no `/projects/$type` list |
| `OrgSidebar/ProjectNav.tsx:35` | `PROJECT_NAV_COMPONENT` → new `AgentVaultNav` |
| `OrgSidebar/types.ts:3` | `PROJECT_TYPE_PATH` |
| `ProjectCategoryOverview.tsx:50` | `PRODUCT_STYLES` — exhaustive, see below. Its sibling array `PRODUCT_TYPES:42` is one of the three visibility lines (§3.0) |
| `components/auth/signupProducts.ts` | `SIGNUP_PRODUCTS` — a visibility line (§3.0). Class strings written out literally, never interpolated: Tailwind's scanner is static |
| `audit-log-stream` product picker | the frontend half of §1.1's silent-failure fix |
| `hooks/api/auditLogs/constants.tsx:466` | `projectToEventsMap` — `Partial<>`, so nothing breaks at build time, but without it the audit page ships an empty event dropdown |

Plus the rest of the `ProjectType.PAM` grep — 38 frontend files in total, of which the table above covers nine. The others, not exhaustively:
`ProductSelectionStep.tsx:32`, `SignupCompleteStep.tsx:93`, `TypeSelect.tsx:29,88,116,191`,
`ProjectNavLink.tsx:33`, `SubmenuViews.tsx:35`, `ProjectSelect.tsx:129`, `ProjectTypePage.tsx:128,153`,
`ProjectAssignmentFields.tsx:60`, `AuditSearchFilter.tsx:71,76`, `LogsFilter.tsx:103`,
`AuditLogStreamProductsField.tsx:46`, `ProjectTemplateDetailsModal.tsx:56`.

**Ten v3 components carry a `pam` variant**, not nine — `Sidebar.tsx:650` has one
(`pam: "data-active:border-l-project data-active:[&_svg]:text-project"`), and `OrgSidebar.tsx:37` sets
`scope = "pam"`. So PAM *did* add a `SidebarScope`; it points the colors at `--color-project` and then
**overrides that variable inline**.

`Sidebar` is five spots, not one: the variant at `:650`, the `from-project/5` gradient condition at
**both** `:199` and `:235`, and an inline `style` override in **both** the mobile sheet (`:207`) and the
desktop rail (`:243`).

The full list: `Badge`, `Button`, `ButtonBadge`, `IconButton`, `Switch`, `Field`, `Tabs`, `Sidebar`,
`v3/platform/PageHeader`, `v2/PageHeader`.

**Two names, and which one goes where matters.** `agent-vault` is the long form; `av` is the short one,
and they are not interchangeable:

| Use `agent-vault` | Use `av` |
| --- | --- |
| `ProjectType.AgentVault = "agent-vault"` | the CSS token `--color-product-av` |
| table prefix `agent_vault_*` | Tailwind classes and *variant* props: `bg-product-av`, `Tabs variant="av"` |
| route path `/organizations/$orgId/agent-vault/…` | the CLI namespace, `infisical av` |
| API prefix `/api/v1/agent-vault` | |
| CASL subjects `AgentVault*` | |
| **`scope` props**, because `PageHeader` and `Sidebar` key theirs off `ProjectType` — `PageHeader scope={ProjectType.AgentVault}` | |

The short form exists only where a long one is unwieldy — a Tailwind class or a command people type
often. Everything structural stays long. (`AGENT_VAULT.md` settles the CLI half of this explicitly:
`infisical av`, but tables, routes and permissions stay `agent_vault` / `agent-vault`.)

**The colour: `--color-product-av: #7a7aff`,** an indigo. Chosen by hue, not taste — the existing
palette leaves exactly one gap:

| Hue | Token | Hex | Contrast on `#19191c` |
| --- | --- | --- | --- |
| 29 | `product-pki` | `#ed8c34` | 7.02 |
| 64 | `product-sm` / `project` | `#e0ed34` | 13.64 |
| 165 | `product-kms` | `#34edbf` | 11.70 |
| 202 | `org` | `#30b3ff` | 7.53 |
| **240** | **`product-av`** | **`#7a7aff`** | **5.06** |
| 275 | `product-ss` | `#b056f0` | 4.54 |
| 345 | `product-pam` | `#ff3568` | 4.98 |

Everything else on the wheel sits within 37° of a neighbour; 202 → 275 is a 73° hole. `#7a7aff` lands
dead centre, 38° from org blue and 35° from Secret Scanning, so it is unmistakable against both. Its
5.06 contrast matches PAM's 4.98. Saturation is 52%, a little under the family's 64–81% band, which is
unavoidable: blue contributes least to luminance, so a true indigo cannot be both fully saturated and
readable as text on this canvas. Saturating it to 60% (`#6666ff`) drops contrast to 4.10, dimmer than
anything else we ship.

Use `var(--color-product-av)` everywhere, including the two inline `Sidebar` overrides. Do **not** copy
PAM's habit of hardcoding a literal there — its `"#ed3453"` has already drifted from its own token
(`#ff3568`).

Mechanically: grep `pam` in each of the ten and mirror it. `Tabs` is the fiddly one — it needs the
`TabsVariant` union extended (`Tabs.tsx:53`) plus entries in two exhaustive `Record<TabsVariant, …>`
maps (`:61`, `:69`) plus the `after:bg-product-av` active-indicator class, so four edits in one file.

Both `PageHeader`s are compile-forced rather than merely stylistic: their scope maps are
`Record<NonNullable<scope>, …>` over a union that includes `ProjectType`
(`v2/PageHeader.tsx:18` `SCOPE_BADGE`, `v3/platform/PageHeader.tsx:24` `PAGE_HEADER_SCOPE_CONFIG`), so a
new enum member breaks the build in both. The other eight are variant maps you can forget silently.

**Five exhaustive type maps will fail `type:check` the moment the enum grows,** and none is obvious
from a `ProjectType.PAM` grep. These are compile requirements, so they land with the enum itself — do
not confuse them with the three visibility arrays in §3.0, even where the two sit in one file
(`ProjectCategoryOverview.tsx` holds one of each):

| Map | Keyed on | Cost |
| --- | --- | --- |
| `OrgSidebar/types.ts:3` `PROJECT_TYPE_PATH` | `ProjectType` | one line |
| `OrgSidebar/ProjectNav.tsx:35` `PROJECT_NAV_COMPONENT` | `ProjectType` | one line |
| `ProjectCategoryOverview.tsx:50` `PRODUCT_STYLES` | `ProjectType` (via `type ActiveProducts = ProjectType`) | four class strings, written out literally for Tailwind's scanner |
| `ProjectRoleModifySection.utils.tsx:3416` `RoleTemplates` | `ProjectType` | one line; PAM's entry is just `[projectManagerTemplate()]` |
| `ProjectRoleModifySection.utils.tsx:3316` `ProjectTypePermissionSubjects` | **both** `ProjectType` and `ProjectPermissionSub` | the real one: a new outer entry, **plus** the three new subjects added as `false` to all five existing product entries. Its own comment says "this structure ensures we don't forget" |

And one keyed on the subjects: `ProjectPermissionSubjects.ts:223`
(`satisfies Record<ProjectPermissionSub, …>`, 51 entries) needs three additions with icon, label and
description — it drives the policy group tiles.

**The two project contexts hardcode PAM, and this is the single biggest trap in Phase 3.**

```ts
// ProjectContext.tsx:16  and  ProjectPermissionContext.tsx:20 — both, identically:
const projectId = params.projectId ?? currentOrg.pamProjectId;
```

Agent Vault routes carry no `params.projectId`, and `pamProjectId` is non-null for every org. So
**every reused project-scoped surface silently resolves to the PAM project** — Access Control, all four
`route-agent-vault.tsx` role/identity/member/group wrappers, the `withProjectPermission`-gated Audit
Logs path (`LogsSection.tsx:309,314`), and `ProjectNav` itself. Nothing errors: an admin sees PAM's
members under an Agent Vault URL.

`isOrgScopedProduct(type)` does **not** cover this — that generalizes four *pathname* checks, while
these are two context providers keyed on a hardcoded field name. Fix it properly: resolve the implicit
project from the current route's product rather than from a literal `pamProjectId`, e.g. a small
`useImplicitProjectId()` that maps the org-scoped product in the path to its `<product>ProjectId` field.
Both providers then share one resolution, and the next org-scoped product is free.

**Add `isOrgScopedProduct(type)` rather than a fifth path check.** Four places sniff the path for PAM,
across four files: `OrgSidebar.tsx:26`, `ProjectSelect.tsx:277`, `TypeSelect.tsx:190`, and
`Navbar.tsx:307` (which uses `startsWith(\`/organizations/${orgId}/pam/\`)` rather than `includes`). A
second implicit-project product is exactly the moment to generalize.

### 3.2 Routes and pages

Mirror `routes.ts:359-379` (`381-384` is the separate top-level `pamAccessRoute`, outside the layout):

```ts
route("/organizations/$orgId/agent-vault", [
  layout("agent-vault-layout", "agent-vault/layout.tsx", [
    index("agent-vault/AgentVaultSessionsPage/route.tsx"),          // don't omit this
    route("/sessions",        "agent-vault/AgentVaultSessionsPage/route.tsx"),
    route("/access-bundles",  [ index(...), route("/$accessBundleId", ...) ]),
    route("/proxies",         "agent-vault/AgentVaultProxiesPage/route.tsx"),
    route("/audit-logs",      "project/AuditLogsPage/route-agent-vault.tsx"),
    route("/access-management", "project/AccessControlPage/route-agent-vault.tsx"),
    route("/roles/$roleSlug", "project/RoleDetailsBySlugPage/route-agent-vault.tsx"),
    route("/identities/$identityId", ...), route("/members/$membershipId", ...), route("/groups/$groupId", ...)
  ])
])
```

The `index(...)` matters: PAM's block has none and survives only via two redirect shims
(`pam-org-access-redirect.tsx`, `pam-access-redirect.tsx`), so `/organizations/$orgId/pam` alone matches
nothing. Do not inherit that.

Two artifacts, not one: `pages/agent-vault/layout.tsx` is the route file, and it renders a
`AgentVaultLayout` component that lives under `layouts/` — PAM splits it the same way
(`pages/pam/layout.tsx` → `@app/layouts/PamLayout`). The route file's `beforeLoad` reads
`org.agentVaultProjectId` from the query cache, calls `fetchAgentVaultProjectId()` on a miss, **patches
the id back into the cached org rather than refetching** (the comment there explains why — a refetch can
race read-replica lag), then `ensureQueryData`s the project and the user's project permissions.

| Page | Build or reuse |
| --- | --- |
| Sessions (landing) | New. Table + Mine/Everyone scope switch for admins. **No Requests tab** |
| Access Bundles list + detail | New. Detail has Connections and Members |
| Connection sheet | New. **4 steps**: Template → Credential → Scope → Review |
| Proxies | New, small. Name, status dot, bypass-host chips, unmatched, edit. Two-phase create with a one-time token screen and Docker / Kubernetes / systemd tabs |
| Audit Logs | **Reuse**, but it needs three things — see below |
| Access Control | **Try the generic page first**, through a `route-agent-vault.tsx` wrapper like the other detail pages. It already keys navigation off `getProjectBaseURL`, which handles org-scoped products. PAM built its own `PamAccessControlPage` (91 lines + 9 components, ~1,600 lines total); if a concrete blocker forces that here, name it in this table and defer the own-page build to a follow-up, not this branch |
| Role / identity / member / group detail | **Reuse.** ~30-line `route-agent-vault.tsx` wrappers supplying breadcrumbs |

#### The screens

**You will not have the mockup.** These wireframes are it. They are derived from
`mockup/Agent Proxy.dc.html`, with all six divergences already corrected — no Requests tab, no
Transforms step, three credential types, `proxiedServiceTemplates.ts` as the catalog, and the two copy
fixes noted there.

Components named below all exist under `frontend/src/components/v3/`. Check `generic/` and `platform/`
before building anything: `Stepper`, `SecretInput`, `OverflowBadgeList`, `Empty`,
`DeleteConfirmDialog`, `CodeBlock`, `CopyButton` and `DurationInput` already exist and cover most of
what these screens need.

**1. Sessions** — the landing page, both roles.

```
PageHeader scope=agent-vault ─────────────────────────────────────────────────────────
  Sessions                                                        [ + Create Session ]
  Tokens agents run with. Each carries a fixed set of access bundles.

Card ─────────────────────────────────────────────────────────────────────────────────
  [ Search identity or bundle ]  (All)(Active)(Revoked)(Expired)  Mine | Everyone ←admin
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │ Identity              Access bundles              Expires      Status       ⋮  │
  ├────────────────────────────────────────────────────────────────────────────────┤
  │ ▣ chop-orchestrator   [on-call-infra][code-review]  in 6 days   ● Active     ⋮  │
  │ ◯ saif@acme.dev       [code-review]                 Never       ● Active     ⋮  │
  │ ▣ deploy-bot          [prod-deploy]                 2d ago      ○ Expired    ⋮  │
  └────────────────────────────────────────────────────────────────────────────────┘
                                                                       ‹ 1 2 3 ›
```

`Table` in a `Card`, filters in the card header, `Pagination` at the bottom. Distinct icon for machine
vs human identity. Bundles are `Badge`; overflow past three uses `OverflowBadgeList`. **Make a `Never`
expiry visually obvious** — it is a permanent bearer token and §1.8 flags that as an accepted risk.
`⋮` holds Revoke, behind an `AlertDialog` whose copy says it takes effect within about a minute.
The Mine/Everyone switch is admin-only and maps to `?scope=mine|all`.

**2. Access Bundles** — list, both roles.

```
  Access Bundles                                                   [ + Create Bundle ]  ←admin
  What an agent can reach. Grant a bundle to a person, machine identity or group.

Card ─────────────────────────────────────────────────────────────────────────────────
  [ Search ]                                                    (A–Z) (Most connections)
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │ on-call-infrastructure     ◧◧◧ +2      3 members                             ⋮  │
  │ Paging, metrics, issue tracking                                                 │
  ├────────────────────────────────────────────────────────────────────────────────┤
  │ code-review                ◧◧        1 member                               ⋮  │
  └────────────────────────────────────────────────────────────────────────────────┘
```

Connection icons are stacked, capped at four with a `+N` overflow — that is `OverflowBadgeList`, and
the icon is re-derived from `hostPattern` against the template catalog, never stored. Row click opens
the detail. A member sees only bundles they can reach.

**3. Access Bundle detail.**

```
  ‹ Access Bundles                                        (Breadcrumb)
  on-call-infrastructure  ✎                    [ Manage Access ] [ Create Session ] [🗑]
  ────────────────────────  ← PageHeader underline in --color-product-av
  Paging, metrics, issue tracking

Card · Connections ───────────────────────────────────────────────────────────────────
  [ Search ]                                                     [ + Add Connection ]
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │ ◧  datadog-us5      Bearer · DD-API-KEY   api.us5.datadoghq.com:443          ⋮ │
  │ ◧  jira             Basic · bot@acme.dev  acme.atlassian.net:443             ⋮ │
  │ ◧  npm-registry     Pass-through          registry.npmjs.org:443, *.npmjs…   ⋮ │
  └────────────────────────────────────────────────────────────────────────────────┘

Card · Members ───────────────────────────────────────────────────────────────────────  ←admin
  ┌────────────────────────────────────────────────────────────────────────────────┐
  │ ◍ Platform Engineering   group     added 3 days ago                          × │
  │ ▣ chop-orchestrator      identity  added 3 days ago                          × │
  └────────────────────────────────────────────────────────────────────────────────┘
```

Host patterns in `font-mono`. The credential summary (`Bearer · DD-API-KEY`) reads straight off
`credentialConfig` with no decrypt — that is the whole reason it is a separate plaintext column.
Delete uses `DeleteConfirmDialog` and must state how many live sessions carry the bundle (§1.8 point 6).
Members card is admin-only; a member sees the Connections card and the Create Session button.

**4. Connection sheet** — `Sheet`, wide (~1120px), four steps via `Stepper`.

```
┌ Add connection ──────────────────────────────────────────────────────── [×] ┐
│ ① Template   │                                    │  Filled in for you      │
│ ● Credential │  Credential type   ( Bearer  ▾ )   │  ✓ Host  api.us5.data…  │
│ ○ Scope      │                                    │  ✓ Header name          │
│ ○ Review     │  Header name  [ DD-API-KEY      ]  │  ✓ Prefix (none)        │
│              │  Prefix       [                 ]  │                         │
│              │  Value        [ ••••••••••  👁 ]  │  Docs ↗                 │
│              │                                    │                         │
│              │  Sends:  DD-API-KEY: <your key>    │                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                       [ Back ]  [ Continue ]  [ Save ]      │
└─────────────────────────────────────────────────────────────────────────────┘
```

Three-column grid: step list, form body, contextual help rail. `SecretInput` for the value. The live
"Sends:" preview is worth building — it is the fastest way a user learns what the prefix does. Editing
unlocks every step and offers Save throughout, with *"leave blank to keep the current secret"* on the
value field. **Do not** copy `EditProxiedServiceForm.tsx`; follow `secret-rotations-v2`, where one form
component serves create and edit via an optional prop.

**Template picker** is the first step, a grid of tiles grouped by category with a search box and a
dashed `Custom` tile, copied from `ProxiedServiceTemplateSelect.tsx`.

**5. Proxies** — readable by both roles, every action admin-only.

```
  Proxies                                                          [ + Create Proxy ]
  Where traffic leaves. Each proxy holds its own certificate authority.

  ┌────────────────────────────────────────────────────────────────────────────────┐
  │ Name       Status            Bypass hosts        Unmatched  Version   CA        ⋮ │
  ├────────────────────────────────────────────────────────────────────────────────┤
  │ egress-1   ● Healthy 12s     [*.internal.acme…]  Allow      0.43.1   SHA256… ⋮ │
  │ egress-2   ○ Never enrolled  —                   Allow      —        —       ⋮ │
  │ egress-3   ◐ Unreachable 4m  [registry.npmjs…]   Deny       0.42.0   SHA256… ⋮ │
  └────────────────────────────────────────────────────────────────────────────────┘
```

Health is server-computed (§1.2) — do not re-derive staleness client-side. Fingerprint is truncated
with a `CopyButton`; this is the only place a member can get a value to pin (§4.1), so the page is
readable by both roles even though every action is admin-only. `⋮` holds Edit settings, New enrollment
token, Revoke, Delete.

**Create Proxy is two-phase**, and phase two is a one-time reveal:

```
┌ Proxy created ─────────────────────────────────────── [×] ┐
│ Shown once. Copy it now.                                  │
│  avp_7k2mfxql4tzb8ncr0jdvhsw3pey5dm2xub        [copy]     │
│                                                           │
│  ( Docker )( Kubernetes )( systemd )                      │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ infisical av proxy \                                 │ │
│  │   --enrollment-token avp_7k2mfx…                     │ │
│  └──────────────────────────────────────────────── copy ┘ │
│                                        [ Done ]           │
└───────────────────────────────────────────────────────────┘
```

All three tabs are the same token auth; only the manifest differs. `CodeBlock` + `CopyButton`.

**6. Create Session** — `Sheet`, both roles. The ordering here is load-bearing.

```
┌ Create session ─────────────────────────────────────── [×] ┐
│ Access bundles      ⣿ 1. on-call-infrastructure       ×    │
│ drag to reorder     ⣿ 2. code-review                  ×    │
│                     [ + Add bundle          ▾ ]            │
│                                                            │
│ ⚠ Both cover api.github.com. on-call-infrastructure        │
│   wins because it is first.                                │
│                                                            │
│ Expires             ( 7 days ▾ )   1h · 8h · 24h · 7d ·    │
│                                    never                   │
│                                                            │
│ Reachable on this session                                  │
│   api.us5.datadoghq.com:443 · acme.atlassian.net:443       │
│   registry.npmjs.org:443                                   │
│                                            [ Create ]      │
└────────────────────────────────────────────────────────────┘
```

The list is **explicitly ordered** — that order becomes `position` and decides which credential wins
(§1.6.1). The overlap warning compares pattern-by-pattern, not set-to-set. The "Reachable" summary lists
host patterns only and says nothing about unmatched hosts, for the reason in §3.5.

**7. Session created** — the one-time token reveal.

```
┌ Session created ───────────────────────────────────── [×] ┐
│ This token is shown once.                                 │
│  agv_9k2mfx7qwl4tzb8ncr0jdvhs4pgy6em1xta…        [copy]    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ infisical av run \                                   │ │
│  │   --token agv_9k2… \                                 │ │
│  │   --proxy <proxy-address> -- claude                  │ │
│  └──────────────────────────────────────────────── copy ┘ │
│  The address differs per network — ask whoever runs the   │
│  proxy. Fingerprints for pinning are on the Proxies page. │
└───────────────────────────────────────────────────────────┘
```

No proxy picker (§3.5): the address cannot be known and the fingerprint is optional.

**8. Access Control and Audit Logs.** Audit Logs is a ~28-line wrapper around the shared `LogsSection`
(§3.2 above). Access Control reuses the generic project page through a thin route wrapper (see the table
above). The PAM-style own page with `Tabs variant="av"` over Members / Groups / Identities is the
fallback, and only on a named blocker.

**Empty states** are §3.4. Use `Empty` with `frame="dashed"`, and write the member variant, not just
the admin one.

**Audit Logs reuse needs three things, not zero.** `PamAuditLogsPage` is 28 lines wrapping the shared
`LogsSection`, but `LogsSection.tsx:337` routes every non-PAM project through
`ProjectAuditLogsPageWithPermission`, which gates on the generic project audit-log permission. Give the
admin role `AuditLogs` (§1.3) so that gate passes, add the `projectToEventsMap` entry so the filter has
events, and check the PAM-only copy arm at `LogsSection.tsx:149`.

Sheet mechanics:

- **Shell**: follow `secret-rotations-v2`, where one `SecretRotationV2Form` serves create and edit via an
  optional `secretRotation` prop. **Do not** follow proxied-services, whose `EditProxiedServiceForm.tsx`
  is a verified 215-line copy-paste of the 320-line create form.
- **Steps**: port `useWizardSteps` from `CertificateWizardSheet.tsx:48`. Its `onFormInvalid` jumps to
  the step owning the first errored field. Proxied-services and secret-rotations-v2 both reimplement
  step state by hand; this is the one worth reusing.
- **Credential step** driven by a per-type field list, so a future type is a config entry, not new form
  code.
- **Template picker**: copy `ProxiedServiceTemplateSelect.tsx` and the 35 entries of
  `proxiedServiceTemplates.ts` (**not** the mockup's catalog), applying correction 4. Add `docsUrl` and a one-line `caveat`; **neither field exists on the catalog today**, so this adds them. **Frontend only** — the backend stays generic and never learns "Anthropic".
  Making the backend validate against a catalog is what turned App Connections into a 114-member enum
  with a 165-case switch. Template output is **not persisted**; the icon re-derives from `hostPattern`.

### 3.2.1 What already exists — do not rebuild it

`frontend/src/components/v3/` is the current library and **everything new uses it**. Only fall back to
`v2/` when there is no v3 equivalent. The full inventory, so you can check before building:

**`v3/generic/`** — Accordion, Alert, AlertDialog, AnimatedCollapse, Badge, Blur, Breadcrumb, Button,
ButtonGroup, Calendar, Card, Checkbox, CodeBlock, ColorPicker, Combobox, Command, CopyButton, DataGrid,
Detail, Dialog, Dropdown, DurationInput, Empty, Field, FileDropzone, HoverCard, IconButton, Input,
InputGroup, Item, Label, Pagination, Popover, RadioGroup, ReactSelect, ScrollableContent, Select,
SelectedActionBar, Separator, Sheet, Sidebar, Skeleton, Spinner, Stepper, Switch, Table, Tabs, TextArea,
Toast, Tooltip

**`v3/platform/`** — AccessRestricted, DateRangeFilter, DeleteConfirmDialog, DocumentationLinkBadge,
GatewayPicker, IdentityRoleBadges, LookingForOrgPageLink, OverflowBadgeList, PageHeader, PageLoader,
PasswordGenerator, PermissionActionSelect, ProjectPermissionSubjects, ScopeIcons, SecretInput,
SecretManagerResources, SecretPathInput, VerificationCode

The ones that map directly onto screens above, and would otherwise get rebuilt by hand:

| Need | Use | Not |
| --- | --- | --- |
| The 4-step connection wizard | `Stepper` | a hand-rolled step index |
| Masked credential entry with reveal | `platform/SecretInput` | `Input type="password"` |
| Stacked connection icons with `+N` | `platform/OverflowBadgeList` | a manual slice + count |
| Empty states | `Empty` with `frame="dashed"` | a bordered `div` |
| Delete a bundle or proxy | `platform/DeleteConfirmDialog` | `AlertDialog` assembled per site |
| The copyable run / enrollment command | `CodeBlock` + `CopyButton` | a `<pre>` and a custom button |
| Page titles with the product underline | `platform/PageHeader` with the Agent Vault scope | `<h1>` |
| Right-side create/edit surfaces | `Sheet` | `Dialog` — reserve centered dialogs for 1–2 fields and one-time reveals |
| Bundle multi-select at mint | `Combobox` | `ReactSelect`, unless you need its async loading |
| TTL picker | `Select` over the five enum values | `DurationInput`, which is for free-form durations and would let someone type `90d` |

**Where to copy patterns from**, in order of usefulness:

| Pattern | Copy from |
| --- | --- |
| Org-scoped product over an implicit project | `pages/pam/layout.tsx` + `layouts/PamLayout/` |
| One form serving create *and* edit | `components/secret-rotations-v2/forms/SecretRotationV2Form.tsx` — an optional entity prop is the mode switch |
| Wizard step state that jumps to the errored field | `useWizardSteps` in `pages/cert-manager/CertificatesPage/components/CertificateWizardSheet.tsx:48` — its `onFormInvalid` is the part worth having |
| Template picker grid | `components/proxied-services/ProxiedServiceTemplateSelect.tsx` |
| Audit logs page | `pages/pam/PamAuditLogsPage/` — 28 lines around the shared `LogsSection` |
| Access control page, only if the generic one is blocked | `pages/pam/PamAccessControlPage/` + its nine components |
| Thin route wrappers reusing generic detail pages | any `pages/project/*/route-pam.tsx` |
| Member-facing empty state copy | `PamAccountsPage.tsx:154-155` — the page branches on role and sets `emptyTitle` / `emptyDescription` per case |

**Read `DESIGN.md` at the repo root before writing copy or choosing colours.** It carries the v3 visual
system and the product voice: engineer to engineer, direct, no exclamation marks, errors that name the
failure *and* the remedy. Secret values masked by default with an explicit reveal. Empty table cells get
a muted dash, never blank.

### 3.3 API hooks and audit enums

`hooks/api/agentVault/` with `queries.tsx`, `mutations.tsx`, `types.tsx`, `enums.ts`. **Do not add it to
`hooks/api/index.tsx`** — that barrel already excludes `pam`, `proxiedServices`, `secretRotationsV2` and
`secretSyncs`; newer domains are imported by subpath.

Audit: extend `hooks/api/auditLogs/enums.tsx`, then `eventToNameMap` in `constants.tsx`. The map is
typed `{ [K in EventType]: string }`, so a missing label fails the build.

### 3.4 Empty states, and the member dead-end

An admin clicks Agent Vault, the project is created behind the scenes, and they land on Sessions —
empty, and empty until someone builds a bundle *and* deploys a proxy. Sessions is the last object in the
chain, so it is the wrong first screen for a new admin unless its empty state does the teaching.

Three states to write, none of which the doc or mockup specifies:

- **Sessions, admin, nothing set up** — point at Access Bundles, and mention a proxy is needed too
- **Access Bundles, admin, empty** — point at Create
- **Sessions or Access Bundles, member with no grants** — say so plainly rather than looking broken.
  PAM's copy is the model: "No accounts available / Ask your PAM admin to grant you access"
  (`PamAccountsPage.tsx:154-155`), plus disabled buttons with explanatory tooltips.

Use the v3 `Empty` component with `frame="dashed"`, which matches the mockup's dashed-block convention.
Read `DESIGN.md`'s voice section before writing the copy.

### 3.5 Teaching the run command — and the thing that does not exist yet

Nothing in the mockup tells anyone what to run. `AGENT_VAULT.md` §10 shows a mint dialog with a copyable
command carrying the token, the proxy address and `--ca-fingerprint`. Two of those three the dialog
cannot know: **a session has no proxy binding** — it is `(projectId, actor, bundles)` — and §4.1 rejects
an address column on the proxy row.

Since §4.1 made the fingerprint **optional**, this gets simpler than it was: **no proxy picker.** The
copyable command carries the token and leaves the address as a `<proxy-address>` placeholder, with a
one-line note that it differs per network:

```
infisical av run --token agv_9k2… --proxy <proxy-address> -- claude
```

Anyone who does want to pin gets the fingerprint from the **Proxies page**, which lists it per proxy.
That is the only reason a member needs `AgentVaultProxies.read` now (§1.3) — the picker justification is
gone, but the page one stands, and a member who cannot see fingerprints cannot pin at all.

Also state in the dialog what the session can reach — the union of host patterns across the chosen
bundles. **Do not state what happens to everything else.** A session has no proxy binding, so the dialog
cannot know which proxy will serve it or what that proxy's `unmatchedHost` is; and §2.2 deliberately
withholds `unmatchedHost` from members anyway. Say "Reachable: …" and stop. `/_agent-vault/whoami`
(§2.6) is where an operator learns the actual runtime boundary, because the proxy knows its own policy.

**Surface bundle order.** `position` is the tiebreak when two bundles cover the same host (§1.2, §1.6.1,
§2.5). It fires narrowly — only on byte-identical patterns in different bundles, since containment is
settled by specificity and everything else is disjoint — but when it fires it silently decides which
credential goes on the wire. A table with a scope switch
never shows order, so **make the mint picker explicitly ordered** — drag or numbered — and warn when two
selected bundles carry identical patterns.

That warning is exact, not best-effort. Per §1.6.1 every pattern pair is identical, contained or
disjoint, so the UI can name precisely which connections collide and which will win. Contained pairs
need no warning at all: exact beats wildcard, deterministically, and that is how someone writes an
override on purpose. But say so in the dialog: the "wins because it is first" copy is only true for
identical patterns. When a later bundle carries `api.foo.com` and an earlier one carries `*.foo.com`,
the later bundle's credential goes to `api.foo.com`, whatever the order.

### Phase 3 checklist

- [x] Product registration: `ProjectType.AgentVault`, `--color-product-av`, `helpers/project.ts`, `PROJECT_TYPE_PATH`, `PROJECT_NAV_COMPONENT`, `PRODUCT_STYLES`, `projectToEventsMap`, `RoleTemplates`, `ProjectTypePermissionSubjects`, `ProjectPermissionSubjects.ts`. **Not** the three visibility arrays. `projectToEventsMap` lands with the audit enums on the next line
- [x] `av` variant on the ten components, `Tabs` four edits, both `PageHeader` scope maps, `Sidebar` five spots using `var(--color-product-av)`
- [x] `useImplicitProjectId()` replacing the `pamProjectId` hardcode in both contexts; `isOrgScopedProduct()` replacing the four path sniffs
- [x] Routes block with `index(...)`, `layout.tsx` + `AgentVaultLayout`, `AgentVaultNav`, the thin `route-agent-vault.tsx` wrappers, Audit Logs wrapper, Access Control through the generic page
- [x] `hooks/api/agentVault/` queries, mutations, types, enums; audit enums and `eventToNameMap`
- [x] Sessions page with scope switch, status filter, `Never` made obvious, revoke dialog; Access Bundles list and detail with member card gated on role; all three empty states from §3.4
- [x] Connection sheet: four steps via `Stepper`, `useWizardSteps` ported, template picker with `caveat` / `docsUrl` added to the catalog and correction 4 applied, live "Sends:" preview, one form for create and edit
- [x] Proxies page with two-phase create; Create Session sheet with ordered bundles and the pattern-level overlap warning; Session created reveal. `type:check` clean, `CLAUDE.md` updated, Progress row updated. Walked end to end in the browser, Proxies included

---

## Phase 4 — backend tail, `av run`, CA trust, docs, and the visibility commit

### 4.0 Backend tail

The four pieces Phase 1 specified and deferred, each marked **[Phase 4]** where it is described:

| Piece | Spec | Done when |
| --- | --- | --- |
| `agent_vault_identities` metering dimension | §1.1 | `usageMeteringService.emit` fires on every membership write path, and the 422 from an unpriced plan is swallowed as described |
| `AuditLogStreamProduct.AgentVault` + frontend picker entry | §1.1, §3.1 | A stream filtered to Agent Vault receives an `access-bundle-create` event |
| `grantAgentVaultAccess` on org invite | §1.1 | Decide between a new `addProductUserMembers` on `agent-vault-member/` and direct writes, then wire the signup chain |
| Retention sweep + `session-expire` | §1.8, §1.9 | An arm in `DailyResourceCleanup` reaps 30 days past `expiresAt` / `revokedAt`, emits `session-expire`, and the two partial indexes are used |

Do these first in the session, before `av run`, because they are backend work and the rest of the
phase is CLI and docs.

### 4.1 `av run`

```bash
infisical av run --access-bundle on-call-infrastructure --proxy 10.0.1.5:17323 -- claude
infisical av run --token agv_9k2… --proxy 10.0.1.5:17323 --ca-fingerprint SHA256:9f:2c:… -- claude
```

Two ways to get a session, exactly one required: `--access-bundle` (repeatable; the CLI mints, needs a
login or MI credentials) or `--token` (from the dashboard; the token is the credential). Plus `--ttl`,
`--keep-session`, `--proxy` (**required**), `--ca-fingerprint`, `--no-proxy`, `--ca-file` (an *output* path — where to write the fetched CA, not a CA to trust; defaults to `~/.infisical/agent-vault/ca.pem`; name inherited from the existing command, and worth a clarifying line in `--help`), `--no-ca-trust` (skip writing the file and setting the trust variables, for a host that already trusts this proxy's CA — the fetch still happens so a mismatch is still caught).

**`--proxy` takes an address, never a name.** The same proxy is `10.0.1.5:17323` in the VPC,
`localhost:17323` as a sidecar, unreachable from outside. An address column would be a lie.

**No in-process mode**, so `--proxy` is always required. Everything on one laptop means running the two
commands side by side, which is the same shape as the remote case rather than a second code path.

Before exec: fetch the CA from the proxy, write it, set the proxy and CA-trust variables, exec.

```
HTTPS_PROXY / HTTP_PROXY   http://agv_9k2…@10.0.1.5:17323
NO_PROXY                   localhost,127.0.0.1  (merged with --no-proxy)
SSL_CERT_FILE / NODE_EXTRA_CA_CERTS / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE   the CA path
```

So the CLI is a convenience, not a requirement: a k8s pod can mount the CA and set these itself.

#### How the CA gets trusted — one mechanism, stateless

**The CLI fetches the CA from the proxy, every run, and trusts it. `--ca-fingerprint` is an optional
verification for anyone who wants it.** That is the whole model. There is no second path, no branch on
login state, and nothing remembered between runs.

```
GET http://10.0.1.5:17323/_agent-vault/ca
{ "proxyId": …, "name": "egress-1", "certificate": "-----BEGIN…", "fingerprint": "SHA256:9f:2c:…" }
```

One call, unauthenticated, returns everything. Write the certificate to `--ca-file`, set the trust
variables, exec. If `--ca-fingerprint` was passed, hash the served certificate and abort on mismatch
before writing anything.

**This is a deliberate product decision, taken 2026-09-02**, and the reasoning should survive:

- It matches the comparable open-source Agent Vault, which serves its CA from
  `GET /v1/mitm/ca.pem` with no verification step at all and sets the same trust variables we do.
- Most operators will never pin, and forcing a mechanism nobody uses buys nothing but documentation.
- The alternative — asking the proxy its identity, then fetching the authoritative copy from Infisical —
  raises the bar from "can answer at this address" to "is a registered proxy in this org," but it costs
  a second code path, a second round-trip, and a rule to explain.

**The residual risk, stated plainly so nobody is surprised later.** Anything that can answer at the
proxy's address can serve its own CA, and the agent will trust it and send its session token. That token
replays against the real proxy and gets real credentials injected into the attacker's requests. This
needs an attacker already positioned inside your network, which is the accepted trade.

The same position also sees the **session token in the clear**. `HTTPS_PROXY` is an `http://` URL, so
every CONNECT carries `agv_…` as a plaintext `Proxy-Authorization` header on the hop to the proxy, and
`/_agent-vault/ca` is plain HTTP too. That is how the shipped `secrets agent-proxy connect` already
behaves (`agent_proxy.go:251-259`) and it is accepted for the same reason. Say it in the docs beside
the CA note rather than leaving it to be discovered.

Worth knowing about the comparison: the other project ships this trust model with a **localhost**
deployment — one binary on `localhost:14321`, where there is nothing between the agent and the proxy.
Ours requires `--proxy` and has no in-process mode, so the same model runs across a network by default.
Same mechanism, more exposure.

Two consequences that fall out of statelessness, both good:

- **Re-enrollment is transparent to `av run`.** Because the CA is fetched fresh every run, replacing a
  proxy's CA needs no action from anyone using the CLI. Only explicitly pinned fingerprints, macOS
  keychain entries and k8s Secrets mounting the CA still need updating (§2.6).
- **`GET /proxies/:proxyId/ca` does not exist.** Its only remaining callers would have been the
  dashboard download and out-of-band setup, and both can fetch from the proxy itself, so the route and
  the stored PEM were dropped rather than kept as a second copy nothing verifies against.

**`/_agent-vault/ca` becomes load-bearing, so the interception rule in §2.6 matters more, not less:**
serve it only for origin-form requests addressed to the proxy itself.

The `--access-bundle` path **revokes on exit** (`--keep-session` opts out); the `--token` path never
does, since the token is not ours to kill.

macOS keychain trust: `ensureCATrusted` in `agent_proxy_run_trust_darwin.go` already probes with
`security verify-cert`, adds the cert, and continues if declined. It is a package-private function
taking one path, so a new command in `package cmd` calls it directly. Needed because Go binaries like
`gh` and `docker` ignore the CA environment variables and read the system trust store.

**No sandbox** (settled). `av run` sets environment variables and execs. Since `secrets agent-proxy run`
keeps its `packages/sandbox` hard fence and its `~/.aws` / `~/.ssh` masking, the two commands genuinely
differ — say so in the docs rather than leaving it implied.

### 4.2 Docs

New tree under `docs/documentation/platform/agent-vault/` plus `docs/cli/commands/av.mdx`, registered in
`docs.json`. The existing `agent-proxy` tree stays where it is.

Must be documented, not just known: **the CA-trust default and when to reach for a pin (§4.1)**, the
three protocol gaps, the no-sandbox difference from
`agent-proxy run`, what `unmatchedHost: allow` actually means, and the one-poll-interval latency on
every change.

Use the **`docs-style` skill** and run `make lint-docs-branch`. Vale cannot see prose indented four or
more spaces inside Mintlify components and reports nothing about what it skipped, so a clean run is not
evidence a nested page was checked.

**Finish with the visibility commit** (§3.0): the three arrays listed there, as the last commit on the
branch.

### Phase 4 checklist

- [x] §4.0 backend tail: metering dimension, `AuditLogStreamProduct` + picker, invite flag, retention sweep + `session-expire`. Covered by three new e2e tests (sweep, predefined roles, invite grant); the two signup pages pass `grantAgentVaultAccess` only once the visibility commit widens `SignupProductType`
- [ ] `av run`: `--access-bundle` mint path and `--token` path, CA fetched from `/_agent-vault/ca`, optional `--ca-fingerprint` pin, trust variables, `NO_PROXY` merge, revoke-on-exit, `ensureCATrusted` on macOS
- [ ] Docs tree under `docs/documentation/platform/agent-vault/` and `docs/cli/commands/av.mdx`, `docs.json` entries, the five must-document items from §4.2 including the plaintext-token note, `make lint-docs-branch` clean
- [ ] End-to-end on one box with both proxies running (§Verification, Phase 4)
- [ ] Root, backend and frontend `CLAUDE.md` updated for the cross-cutting pieces
- [ ] The visibility commit: `PRODUCT_TYPES` ×2 and `SIGNUP_PRODUCTS`, last on the branch
- [ ] `make reviewable-api` and `make reviewable-ui` once; both PR descriptions drafted from the template and cross-linked (not pushed); Progress table finalised

---

## Out of scope

| | Why |
| --- | --- |
| Removing proxied services / agent proxy | Deferred. Nothing Agent Vault owns may depend on it, which is why the engine is copied rather than moved |
| Request / session activity stream, the Requests tab | v2: audit logs only. The cost is real — "which bot reached which host and which rule let it through" is the question this product exists to answer. §2.6's `whoami` and §3.5's mint-dialog copy are the partial mitigation |
| Path prefixes, method filtering | The matcher compares the decoded path while the upstream gets the escaped one |
| Transforms / substitutions | In the mockup, not in v2 |
| OAuth2 client credentials, AWS SigV4 | Deferred. Both slot into the same two columns with **no migration**, which is why the discriminator is a column |
| Personal / per-member credentials | v2 |
| Proxy HA, proxy groups, a group CA | Deferred with HA |
| Any enrollment method but token | AWS and Kubernetes exist in `resource-auth-method` and are additive later |
| In-process proxy mode | Drops the local-resolver path and the ephemeral in-memory CA with it |
| Sandboxing in `av run`; a license flag; WebSocket / streaming / h2 fixes | Settled in planning |
| `lastUsedAt`, credential validation on save | Settled in planning — costs stated below |
| Sub-second revocation | One poll interval, 60s default |
| Making `projectType` required on `buildProjectPermissionRules` | A real 8-site bug, but fixing it changes PAM behaviour. Its own change, its own tests |

### Decided against, with the cost stated

Three things the reviews surfaced and we deliberately are not doing. Recorded because each has a real
cost, and the first person to hit one should find the reasoning rather than re-open the debate.

- **`lastUsedAt` on a connection — no.** `proxied_services.lastUsedAt` exists today
  (`proxied-service-dal.ts:214`) and the CLI already batches usage reports back (`proxy.go:172-193`,
  `api/agent_proxy.go:120`), so the build cost was low. **The cost of skipping it:** combined with no
  request stream, v1 ships with *zero* signal about what agents actually reached — strictly less
  visibility than the feature it replaces. The first "is this credential still in use?" has no answer.
  This is the most likely of the three to come back. Claude Tag ships it as a per-connection
  **Used** / **Never used** stamp, independent of status.
- **Credential validation on save — no.** A real test means the backend making outbound calls to
  arbitrary customer-supplied hosts, which is an SSRF surface we would have to defend, and there is no
  generic "is this token valid" request for an arbitrary API — PAM's `assertConnectionOk` works only
  because it speaks known protocols. **The cost:** a wrong credential surfaces as someone's agent
  401ing hours later, with nothing in-product to see it in.
- **The vocabulary collisions — keep the names.** "Sessions" is also PAM's word for a recorded
  privileged-access session, and both products are org-level singletons in the same sidebar;
  "Connections" is App Connections; "Proxies" sits beside Gateways and Relays under Networking.
  **The cost:** a user of both products sees two "Sessions" meaning different things. Judged
  survivable — the two live in separate nav sections, and both are "a scoped, revocable grant of
  access", so the shared word is imprecise rather than misleading. Renaming after Phase 1 means table
  names, permission subjects, routes and docs, so this is the last cheap moment and we are passing on it
  knowingly.

### Alternatives rejected

- **Resource-scoped memberships for bundle access.** `getResourceMembership` INNER JOINs
  `membership_roles` (`permission-dal.ts:430`) and our grants carry no role, so the row would be
  invisible to the query that reads it. The CHECK also requires `scopeProjectId`, `RESOURCE_SCOPE` sits
  outside the `AccessScope` enum so there is no factory, and PKI and Signer are two near-duplicate
  ~700-line services. Approval-policy approvers, the one entity with our exact semantics, chose a join
  table. Cost: the five cleanup calls in §1.4.
- **CASL conditions for reachability.** Conditions interpolate only `identity.id`, `username` and
  `metadata`, so "who can reach this bundle" stops being answerable in SQL. App Connections does this
  and filters in memory, which would kill the Members tab.
- **A JWT session token.** Zero DB reads saved, because resolve hits the DB anyway; costs stale scope
  plus a revocation-marker subsystem.
- **An org root CA with signed intermediates.** Every agent in the org trusts one root; to be safe that
  needs a CASL gate, NameConstraints, an issuance record and a CRL — and NameConstraints do not even
  work, since macOS ignores them on user-added anchors. Per-proxy self-signed avoids all of it, and
  caps a key compromise at the agents using that one proxy.

  **To be precise about what this does and does not fix.** `AGENT_VAULT.md` §7.2 says the choice
  "deletes the signing endpoint and its missing authorization check." That was written when the old
  feature was being removed. Under this plan **nothing is removed**, so `ee/services/agent-proxy-ca/`,
  `agent-proxy-ca-router.ts` and the `org_agent_proxy_config` table all stay exactly as they are, and
  finding #1 — any org member can mint an unconstrained interception CA, because the service builds a
  permission ability and discards it — **remains live in the shipped product**. Agent Vault simply does
  not call it. That is a real vulnerability in proxied services and it needs its own fix on its own
  timeline; do not let this plan's existence be read as having addressed it.
- **A capabilities endpoint for nav gating.** PAM needs `useGetPamAccessCapabilities` because its folder
  grants are invisible to CASL. Ours are a plain list: the role is already in the project permission
  context, and "can I reach any bundle" is `GET /access-bundles` being non-empty.
- **Making `AgentVaultProxies` an org subject** to fit the `resource-auth-method` framework — §2.1.
- **An `address` column on the proxy row.** There is no single address for a proxy.

### Deferred: retiring proxied services

In one change: drop the three tables and their migrations, delete `ee/services/proxied-service/` and
`ee/services/agent-proxy-ca/` and their routers, remove the Secret Manager Overview entry and
`components/proxied-services/`, delete `packages/agentproxy` and the `secrets agent-proxy` commands, and
redirect the **eight** `docs/documentation/platform/agent-proxy/` entries (`docs.json:447,451-453,459-462`)
plus the six `api-reference/endpoints/proxied-services/*` entries (`:2782-2787`). Nothing in Agent Vault
imports any of it, so the removal is mechanical by construction. Precedent for leaving rows behind:
migration `20260729150000` dropped the SSH and Agent Sentinel products but left their project rows in
place, excluded from the billable count.

---

## Verification

These are **checkpoints while building**, not gates on merging — nothing merges until all four are done
and the end-to-end below passes.

**Phase 1** — `cd backend && npm run migration:latest-dev && npm run generate:schema`, then drive the
API with curl: bootstrap the project by hitting any Agent Vault route, create a bundle, add a bearer
connection, grant it to a group, mint a session. E2E specs in `backend/e2e-test/routes/` via
`testServer.inject()`.

**Phase 2** — bring up `docker-compose.dev.yml`, register a proxy, run
`infisical av proxy --enrollment-token …`, then `curl -x localhost:17323 https://<matched host>` and
confirm the credential arrives. Restart with the same token and confirm it serves rather than 401s. Go
tests in `packages/agentvault/`, plus the shared grammar fixture read by both suites.

**Phase 3** — `cd frontend && npm run dev`. Walk the flow: land on Sessions, hit the empty state, create
a bundle, add a connection through all four steps, grant it, mint a session, copy the run command.

**Phase 4** — end to end on one box, with **both** proxies running to prove the ports do not collide:
`av proxy` in one terminal, `av run --access-bundle … -- curl …` in another, the agent holding no
credential at all.

**Security invariants, as tests rather than review notes:**

| # | Invariant | Test |
| --- | --- | --- |
| 1 | The bundle set comes only from the session row | Mint for {A}, resolve naming {A,B}, assert only A |
| 2 | Resolve is proxy-bound | A proxy in org B presenting an org A session → 404 |
| 3 | Foreign ids are 404, never 403 | Table-driven across every route |
| 4 | No client-supplied id reaches a decrypt call | Assert decrypt receives the session row's `projectId` |
| 5 | The proxy token authorizes identity only | Use it against bundle CRUD → **403**, not 401. The mechanism is as described — `verifyAuth` rejects it on auth-mode selection, before any CASL check — but the shared `verifyAuth` throws `ForbiddenRequestError`, so the code is 403. Verified live |
| 6 | Injection requires TLS upstream, regardless of pattern | `http://` to a matched portless pattern → no credential; **and** `http://host:8080` to an explicit `host:8080` pattern → no credential |
| 7 | Match and send agree byte for byte | `..`, `%2f`, `//`, trailing dot, uppercase, U+212A |
| 8 | The cache has a hard deadline | Freeze the backend, advance past five poll intervals, assert fail-closed |
| **9** | **Membership loss lands within one poll** | Remove a member mid-session, assert the bundle drops. **Plus the admin case: demote a session's minter from admin to member and assert every non-granted bundle drops** |
| 10 | Private ranges are blocked **unconditionally**, not by the unmatched-host policy | CONNECT to `169.254.169.254` → 403 **with `unmatchedHost: allow`**, which is the default. The SSRF block must not be a side effect of `deny` mode, or the default deployment is an SSRF pivot |
| 11 | A custom role resolves to member | Full admin rules in a custom role, assert the member set |
| 12 | A deleted bundle contributes nothing | Delete a bundle a live session carries; assert resolve returns its connections no longer and the session row still shows the name |
| **13** | **A machine identity inherits a group's bundles** | Grant a bundle to a group, put a machine identity in it via `identity_group_membership`, mint and resolve. Catches the `user_group_membership`-only mistake in §1.3, which fails silently and would break the product's primary actor |

**Non-goals, stated so nobody assumes otherwise.** We do not protect a credential from its own agent — an
agent can call any endpoint on a matched host, so a header-echoing endpoint returns the secret. And
`av run` does not isolate the agent from its machine.

Do not run `make reviewable-api` / `make reviewable-ui` after small edits; run them once before opening each
PR.

Each phase adds to `backend/src/ee/services/agent-vault/CLAUDE.md` (a concept map, following
`pam/CLAUDE.md`'s own rules about staying high-level) and to the root, backend and frontend CLAUDE.md
files where the change is cross-cutting.

**And each phase updates the Progress table at the top of this file** — what landed, what changed from
the plan, anything the next session needs. That table is the whole reason this document lives in the
repo rather than in a session.

---

## Appendix A: Source documents, and what to trust

**This plan supersedes all of them.** Where it disagrees with any document below, the plan is right; it
was written later, against the code, with the product owner in the room.

| Document | Where | Status |
| --- | --- | --- |
| **This plan** | `AGENT_VAULT_PLAN.md`, repo root | Authoritative |
| `AGENT_VAULT.md` | `/Users/saif/infi/repos/infisical.agent-product/AGENT_VAULT.md`, untracked, ~1,700 lines | Useful background. **Several claims are wrong** — see [Do not re-derive these](#do-not-re-derive-these) |
| `AGENT_VAULT_REVIEW.md` (**v1**) | same directory, untracked | Superseded by v2 |
| **Review doc v2** | **Nowhere on disk.** It existed only in the planning conversation | Was the spec of record; its content is folded into this plan. Deltas below so you can recognise them |
| Mockup | `mockup/` in the Infisical worktree — `Agent Proxy.dc.html`, `screenshots/`, `uploads/` | Usable for IA and visual language; diverges in six places, see [The mockup diverges](#the-mockup-diverges-from-the-settled-design-in-six-places) |

**Do not go looking for review doc v2 — it does not exist as a file.** It was v1 plus the deltas below,
and every one of them is already implemented in this plan:

- `bundle` → **access bundle** throughout: tables `agent_vault_access_bundles`,
  `agent_vault_access_bundle_members`, `agent_vault_session_access_bundles`, and `/access-bundles` routes
- **Proxy settings move server-side.** `unmatchedHost`, `bypassHosts` and `pollInterval` become columns
  on `agent_vault_proxies`, returned in full on every heartbeat and applied without a restart. They used
  to be start flags, which is why they are gone from the CLI
- **Proxy re-enrollment.** `POST /proxies/:proxyId/enrollment-token` reissues a one-time token;
  `PATCH /proxies/:proxyId` edits name and settings. Re-running `av proxy --enrollment-token` is how a
  box is redeployed or its token rotated
- **New audit events** `proxy-token-reissue` and `proxy-update`; `AgentVaultProxies` gains `edit`
- **Grace window is five poll intervals**, not a hardcoded 300s
- v2 also described a `revokeNow` flag on the reissue call. **That was replaced** during planning with a
  proper `POST /proxies/:proxyId/revoke` route, because no such flag exists in the codebase and gateway
  does it as a route — see §2.6

One more note on `AGENT_VAULT.md`: it was written when the old proxied-services feature was going to be
**deleted**. That decision was reversed. Any claim in it that depends on deletion — most importantly
"this deletes the vulnerable signing endpoint" — no longer holds.

---

## Do not re-derive these

Everything here was checked against the code during planning. Each one **looks** wrong and is right, or
**looks** right and is wrong. Left alone, a careful engineer will spend hours rediscovering them, or
will "correct" the plan back into a bug.

| # | The claim | The truth |
| --- | --- | --- |
| 1 | `AGENT_VAULT.md` §9.1 implies PAM blocks generic project creation | **It does not.** `backend/src/server/routes/v1/project-router.ts:222` (note there are two `project-router.ts` files; the create route is the `server/` one, not `ee/`) accepts `type: z.nativeEnum(ProjectType)` with PAM valid, and `createProject` has no guard. PAM only blocks *deletion* (`project-service.ts:771-776`). We write both guards ourselves |
| 2 | PAM is the template for the admin role | **Not for this.** `default-roles.ts:1153` is literally `pamProjectAdminPermissions = projectAdminPermissions` — the exact aliasing the doc warns against. Write our admin set out explicitly |
| 3 | `getPredefinedRoles` is duplicated and needs fixing | **Needs no edit.** Neither copy special-cases PAM; the type dispatch in `buildProjectPermissionRules` does the work. Less work than the doc implies |
| 4 | `AGENT_VAULT.md` §6.4: drop AWS, GCP, Azure, Snowflake, Salesforce from the template catalog | **None of those five is in the catalog.** All 35 entries port over. The real work is three templates carrying paths and three carrying tenant wildcards — see [Corrections](#corrections-to-the-design-docs) |
| 5 | `AGENT_VAULT.md` §6.2: "overlapping wildcards are not decidable in general" | **False for this grammar.** A wildcard is leftmost-only and single-label, so every pattern pair is identical, contained or disjoint. Write-time detection is exact. See §1.6.1 |
| 6 | Cross-bundle collisions can't be detected because "two admins may own different bundles and cannot see each other's" | **False in our model.** One admin role per project, and an admin reaches every bundle. Collisions are detectable and we warn on them |
| 7 | The CA choice "deletes the signing endpoint and its missing authorization check" | **It does not**, because nothing is removed. `ee/services/agent-proxy-ca/` stays and the vulnerability stays live in proxied services. Agent Vault simply does not call it. That needs its own fix on its own timeline |
| 8 | Claude Tag's "Active / Not active" is how they resolve credential conflicts | **No.** The row menu is Edit / Rotate secret / Delete — there is nothing to toggle. Their docs define Not active as "the secret is stored but no allow rule uses it yet." They have cross-scope precedence (narrowest scope wins) but **no admin-controllable within-scope mechanism** — a fixed priority decides, with no ordering UI and no toggle. This was misread twice during planning; do not misread it a third time |
| 9 | The old local CLI mode sandboxed because `connect` handed the child a token | **Two different commands.** `secrets agent-proxy run` is local, sandboxed, and hands the child **no** token (`agent_proxy_run.go:462`). `connect` is remote, unsandboxed, and does set `INFISICAL_TOKEN` |
| 10 | The specificity ladder has three rungs (exact host, specific port, longest path) | **One rung.** Paths are banned and portless defaults to 443, so no pattern ever has an unspecified port. Far more traffic reaches the `position` tiebreak than the original design assumed |
| 11 | `--port 17322` is fine for `av proxy` | **Collides** with the shipped `secrets agent-proxy start` default (`agent_proxy.go:487`). Use **17323**. Phase 4's verification runs both on one box |
| 12 | Copy `gatewayMetricsReportLimit` for the resolve rate limit | **Copy its shape, not its numbers.** Its ceiling is `max: 10` per 60s; one proxy serving N sessions makes N resolve calls per interval, so verbatim it fails closed past ten sessions |
| 14 | `credentialConfig jsonb` can carry a DB default | **It cannot.** `scripts/generate-schema-types.ts`'s `getZodDefaultValue` returns the bare string `"z.string()"` for `jsonb`, which is concatenated onto the type and emits `z.unknown()z.string()` — a parse error. No existing table has a jsonb default, so the bug has never fired. The column is `NOT NULL` with no default; the service always writes it. Same trap for `smallint`, which `getZodPrimitiveType` does not handle at all — `position` is `integer` |
| 15 | The proxy must zero credential bytes on eviction | **No.** Dropped in review — see §2.5. It raced with in-flight requests and defended a door next to an open one |
| 16 | `resolve` can let permission errors surface as they are | **No.** A removed actor is a 403 from `getProjectPermission`; the proxy treats a 403 as "Infisical unreachable" and keeps serving for five polls. Map `ProjectMembershipNotFound` to 401 — see §2.2 |
| 17 | The `index(...)` in §3.2 can point at `AgentVaultSessionsPage/route.tsx` | **It cannot.** A route file exports exactly one `Route`, and the Vite plugin imports one per entry. The index is `redirects/agent-vault-index-redirect.tsx`, exactly as PAM's `/access` index is a redirect shim (`routes.ts:361`) |
| 18 | The URL helpers in §3.1 and the routes block in §3.2 are separate pieces of work | **They are one commit.** Giving `getProjectBaseURL` / `getProjectHomePage` an Agent Vault arm widens their literal return type, and TanStack checks it against the generated route tree, so `type:check` fails until the routes exist. Note `getProjectHomePage(type, environments)` takes two arguments; org-scoped callers pass `[]` |
| 19 | Access Control just needs a thin `route-agent-vault.tsx` wrapper | **Not quite.** The generic page renders its Users / Machine Identities / Groups tabs only when `hasTabs` (cert manager and secret manager); every other type relies on the sidebar submenu, which PAM opts out of. Agent Vault joins the `hasTabs` branch and takes the `ProjectNav.tsx:73` early return, or those two tabs are unreachable — which is where the backend's "Add them under Access Control first" error sends people |
| 20 | `OverflowBadgeList` can render the stacked connection icons in §3.2's screen 2 | **It cannot.** Its `getLabel` returns a string and it has no icon slot. The bundle row shows template *names* as `av` badges; brand images appear on the detail page's connection rows, where there is room |
| 21 | The `LogsSection.tsx:337` gate should be bypassed for Agent Vault as it is for PAM | **No.** PAM bypasses it because PAM has its own product permission model. The Agent Vault admin role holds `AuditLogs.read` (§1.3), so the generic gate passes for an admin and correctly shows the access-restricted dialog to a member. Only the `" in this project"` copy arm at `:149` changes |
| 22 | A React Query key factory may fold its parameters into the same function used for invalidation | **Not with an optional parameter.** `sessions(params)` used as both the list key and the invalidation prefix produces `[..., "sessions", undefined]`, which prefix-matches nothing, so a freshly minted session did not appear until a reload. Split it: `sessions()` is the prefix, `sessionList(params)` the query key |
| 23 | The dev stack's session and the curl JWT last the session out | **They can both die mid-run.** The browser refresh call starts 404ing and the JWT returns `Session not found`, which looks exactly like a broken page. Check `POST /api/v1/auth/token` in the network panel before debugging a blank screen, and note that re-logging in needs a human — entering the password is not something the agent does |
| 13 | `projectId` FK columns are `uuid` | **`projects.id` is `varchar(36)`** (`20231212110939_project.ts:9`), not uuid. Every `projectId` FK in the schema uses `t.string("projectId", 36)`, as `pam-account-dependencies-rework.ts:16` does |

---

## Appendix B: Prior art, Anthropic Claude Tag

Researched during planning so you do not have to. Anthropic ship a product with nearly our exact
architecture — agents in a sandbox, credentials injected at a proxy, grouped into "access bundles",
and their proxy is literally called Agent Proxy. Public docs:

- [How agent identity works](https://claude.com/docs/claude-tag/concepts/agent-identity) — the request path and the three allow layers
- [Give Claude access to your tools](https://claude.com/docs/claude-tag/admins/add-connections) — bundles, credential types, host rules, statuses
- [Configure per-channel access](https://claude.com/docs/claude-tag/admins/attach-to-scope) — scopes and conflict precedence

What is worth knowing:

- **Same thesis.** *"Credentials are injected at the network boundary by Agent Proxy; the model and the
  sandbox are not given the key. A request to a host you haven't allowed is blocked, not sent."*
- **Three allow layers** — a Domains entry (no credential), a connection (with credential), and the
  environment's network setting. Maps onto our `bypassHosts` / connections / `unmatchedHost`.
- **Conflict resolution.** *"The credential from the narrowest scope is used: channel beats workspace,
  which beats Default Slack access."* Then: *"Within the same scope, the order isn't admin-configurable.
  Avoid binding overlapping credentials at the same scope; if you can't predict which key acts, neither
  can a security review."* And: *"There is no fallback. If the winning credential gets a 401 or 403,
  Claude does not retry with the next one."*
- **They do not solve our hard cases.** Their scope hierarchy only resolves collisions *across* scopes.
  Two connections in one bundle, or two bundles at one scope, fall to a fixed priority the admin cannot
  set — no ordering UI, no enable/disable. We are ahead on the cross-bundle case because `position` is
  caller-controlled.
- **Two invariants worth copying verbatim:** *"You can't enter `*` alone here; a credential is always
  limited to specific hosts"* and *"Private IP ranges and cloud metadata endpoints stay blocked
  regardless."*
- **Their propagation delay is also about a minute**, which is a useful sanity check on our 60s poll.
- **Where they are ahead:** nine credential types to our three; path and method restrictions, which we
  deliberately ban; and **setup links**, where an admin who does not hold a secret sends a link to
  whoever does, who submits it directly (status goes Pending → Approval needed → Active). That last one
  is a genuinely good idea we have not scoped.
- **Their wildcard differs from ours:** theirs *"covers subdomains at any depth"*, ours matches exactly
  one label. Do not copy their semantics — §1.6.1's decidability argument depends on ours.

---

## Appendix C: Glossary

| Term | Means |
| --- | --- |
| **Access bundle** | A named set of connections. The unit you grant to someone |
| **Connection** | One HTTP target plus its credential: host patterns, a credential type, the encrypted secret |
| **Member** | A user, machine identity or group that can reach a bundle. Our own join table, not `memberships` |
| **Session** | A minted token naming one actor, a subset of their bundles, and an expiry. The token *is* the session |
| **Proxy** | A deployed egress node with its own certificate authority. One row per box |
| **`position`** | The order bundles were named at mint. Breaks ties when two bundles cover the same host |
| **Resolve** | `POST /proxy/resolve` — the only endpoint that ever decrypts a credential |

Three of these collide with existing Infisical vocabulary, deliberately and knowingly:
**Sessions** is also PAM's word for a recorded privileged-access session, **Connections** is also App
Connections, and **Proxies** sits near Gateways and Relays under Networking. Keeping the names was a
settled decision — see [Decided against](#decided-against-with-the-cost-stated).
