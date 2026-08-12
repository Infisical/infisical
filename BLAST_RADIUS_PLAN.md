# Blast Radius: Implementation Plan

**Status**: implemented end to end (phases 0 to 6). Verified against the local dev stack.
**Owner**: Thiago
**Context**: Infisical hackathon
**One-line pitch**: everything that touches this secret, and what happens if you change it.

---

## 1. What this is

A single view, anchored on one secret, that answers five questions at once:

1. **Who can reach it** (users, machine identities, groups)
2. **Why they can reach it** (which role, group, privilege, or ABAC condition granted it)
3. **Where the value has gone** (syncs, imports, replications, references, cross-project grants)
4. **Who actually reads it** (observed consumers, who is entitled but never reads it, and who read it in the past but can no longer)
5. **What breaks if you rotate it right now**

Two visual conventions carry the whole feature:

> **Solid edges are observed. Dashed edges are entitled but not seen in the window.**

A screen full of dashed lines is a picture of over-provisioning that needs no explanation.

> **Ghost readers sit apart: people and identities that read this value and cannot read it today.**

Removed from a group, expired temporary grant, left the project, left the org, deleted outright. They never appear in the entitlement leg, but they know the value. This reframes rotation from "will it break" to "should this value still be considered secret."

### Why it matters commercially

- Fear of breakage is the actual blocker to rotation adoption, and rotation is a paid surface. "Safe to rotate, and here is exactly what will break" converts directly.
- It creates a reason to open Infisical when you are not editing a secret, which is the missing habit loop for a secrets manager.
- Legs 3 and 5 require knowing where a value was distributed. HashiCorp Vault does not sync, so it cannot compute them at any price. This is structural, not a feature gap they can close.

---

## 2. What already exists (reuse, do not rebuild)

This was checked against `main` before writing the plan. Two of the five legs are already shipped.

| Existing surface | Location | What it does | How we use it |
| --- | --- | --- | --- |
| Secret access list API | `backend/src/ee/routes/v1/secret-router.ts:20`, service at `backend/src/services/secret/secret-service.ts:1303` | Builds a CASL ability for every user, identity, and group in a project and evaluates secret actions against env, path, name, tags. Expands group membership. Gated on `plan.secretAccessInsights` | **Leg 1 verbatim.** Also the template for auth and plan gating |
| `getProjectPermissions` | `backend/src/ee/services/permission/permission-service.ts:851` | Returns per-principal CASL abilities for a whole project | The engine under leg 1 and leg 2 |
| Secret Access Insights UI | `frontend/src/pages/secret-manager/OverviewPage/components/SecretTableRow/SecretAccessInsights.tsx`, opened from `SecretEditTableRow.tsx:1918` | Sheet with a filterable principal table plus inline grant actions | Becomes the **table mode** of the new view. Its grant flows are the model for the revoke flows |
| AccessTree | `frontend/src/components/permissions/AccessTree/` | React Flow graph of role to folder access, with a Permission Simulation panel. Used in the role editor only | Fork `utils/positionElements.ts` (dagre), `nodes/ShowMoreButtonNode.tsx`, and the progressive-disclosure pattern in `hooks/index.ts` |
| Secret reference graph | `frontend/src/components/secrets/SecretReferenceDetails/` | React Flow graph of reference dependencies, with cycle detection | Reference rendering patterns, and its `visited` set approach for cycles |
| Insights page | `frontend/src/pages/secret-manager/InsightsPage/` | Cards, charts, calendar over already-collected data | Home for the org-level exposure ranking card |

**Already available as dependencies**: `@xyflow/react` v12, `@dagrejs/dagre`, `recharts`, `framer-motion`. No new frontend deps needed.

### What is genuinely new

Legs 2, 3, 4, 5. Grant-path attribution, distribution, observed consumption, and rotation simulation. Nothing in the codebase computes any of them today.

---

## 3. Source data

Every edge comes from data Infisical already stores. No new collection required.

### Leg 1: entitlement (reuse)

`permissionService.getProjectPermissions(projectId, orgId)`, then evaluate with `hasSecretReadValueOrDescribePermission` and `permission.can(...)` against `subject(ProjectPermissionSub.Secrets, { environment, secretPath, secretName, secretTags })`. Group expansion via `user_group_membership` and `identity_group_membership`.

### Leg 2: grant path (new, core algorithmic work)

The existing code merges every role, group role, and additional privilege into **one** ability, which is why it can say *that* someone has access but not *how*. Invert the loop: build **one ability per grant source**, and record which sources grant.

| Source | Table | Notes |
| --- | --- | --- |
| Direct membership role | `memberships` + `membership_roles` | Unified table: `scope`, `actorUserId` / `actorIdentityId` / `actorGroupId`, `scopeProjectId` |
| Custom role | `membership_roles.customRoleId` to project roles | Rules are unpacked CASL |
| Group role | `memberships` with `actorGroupId` | Then expand to members |
| Additional privilege | `additional_privileges` | Unified table, `permissions` jsonb |
| Temporary grant | `isTemporary` + `temporaryAccessEndTime` on both `membership_roles` and `additional_privileges` | Render as an expiry badge. High signal for access reviews |
| ABAC condition | The granting rule's `conditions` | `$GLOB` / `$IN` / `$EQ` / `$NEQ` on `environment`, `secretPath`, `secretName`, `secretTags` |
| Identity metadata interpolation | `resource_metadata`, applied through the handlebars step at `permission-service.ts:864-882` | Must be preserved per principal or ABAC attribution is wrong |

**Key API**: CASL's `ability.relevantRuleFor(action, subject)` returns the exact rule that decided the outcome, including its `conditions`. We render that rule rather than reimplementing matching.

**Performance shape**: run the merged-ability pass first (existing, tuned code) to get the set of principals *with* access, then run per-source attribution only on that subset. On a project with 400 principals where 12 have access, that is 12 attributions, not 400.

### Leg 3: distribution (new, pure SQL)

The secret resolves to a `folderId`, and nearly everything downstream keys off that folder.

| Edge | Source | Detail |
| --- | --- | --- |
| Secret sync | `secret_syncs` where `folderId` matches | `destination`, `destinationConfig`, `syncOptions` (`keySchema` gives the destination key name), `syncStatus`, `lastSyncedAt`, `isAutoSyncEnabled`. `secret-sync-dal.ts:16` already joins folder to path |
| Importing folder | `secret_imports` where `importEnv` + `importPath` match this secret's env and path | The fan-out that surprises people. Recurses: an importing folder has its own syncs |
| Replication | `secret_imports.isReplication`, `lastReplicated` | Replicated copies live elsewhere |
| Referencing secret | `secret_references_v2` where `environment` + `secretPath` + `secretKey` match | The **reverse** of `useGetSecretReferenceTree`. `targetProjectSlug` gives cross-project for free |
| Cross-project grant | `project_folder_grants` (`sourceFolderId`, `targetProjectId`) | Another project's principals reach into this folder |
| Rotation managed | `secret_rotations_v2` + `secret_rotation_v2_secret_mappings` | If managed, rotation is safe by construction. Major input to leg 5 |
| Legacy integration | `integrations` + `integration_auth` | Older projects only. Post-MVP |
| Agent proxy usage | `proxied_service` config referencing the secret | Post-MVP, but "brokered to agents" is a compelling edge |
| Honey token adjacency | `honey_token_secret_mappings` | Post-MVP flavor: the tripwire next to the real thing |

### Leg 4: consumption (new, with one honest caveat)

Source: `audit_logs` filtered on `projectId`, `eventType IN ('get-secret', 'get-secrets')`, `eventMetadata->>'environment'`, `eventMetadata->>'secretPath'`, within a bounded window.

**Read this before designing around it.** From `backend/src/ee/services/audit-log/audit-log-types.ts:1063`:

- `GET_SECRET` (single read) records `secretId`, `secretKey`, `secretVersion`. Exact per-secret attribution.
- `GET_SECRETS` (bulk read, what every CLI and SDK call actually does) records only `environment`, `secretPath`, `numberOfSecrets`. **It does not record which keys were returned.**

So per-secret attribution is exact only for single reads. For the dominant bulk path, precision is folder plus environment. **Do not paper over this.** Every consumer carries a `precision: "secret" | "folder"` field and the UI labels it. Claim per-key precision and the first customer who checks will catch it.

#### What each consumer carries

Per `backend/src/server/plugins/audit-log.ts`, which builds `auditLogInfo` on every request:

- **Users**: `email`, `username`, `userId`, `authMethod`. A real person with a real email, not a UUID.
- **Identities**: `name`, `identityId`, `authMethod`, plus `actorMetadata.kubernetes` / `.aws` / `.oidc` auth details, so we render "the `payments-api` service account in namespace `prod`" instead of a UUID.
- **Both**: `ipAddress` and `userAgentType`, which distinguishes `web`, `cli`, `k8-operator`, `terraform`, `InfisicalNodeSDK`, `InfisicalPythonSDK`. This distinction matters more than it looks: a human reading a prod database password **in a browser** is a different event from the same person's **CLI** reading it during a deploy. Surface both.
- Other actor types can appear on a read (`SERVICE` for legacy service tokens, `PLATFORM` for automated actions, `UNKNOWN_USER` for unauthenticated). Handle them rather than assuming user-or-identity.
- Aggregate DAL methods to model on: `countByDateAndActor`, `countByIpAddress`, `countByAuthMethod` (`audit-log-dal.ts:330`).

#### Ghost readers: observed but no longer entitled

`actorMetadata` is **denormalized jsonb**. Email and name are copied into the log row at write time, not joined from the users table. That gives us a category nothing in the product surfaces today: **principals that read this value and cannot read it today.**

Causes: removed from a group, expired temporary grant, removed from the project, left the org, user or identity deleted outright.

They never appear in the entitlement leg, because `getProjectPermissions` only knows current membership. Compute them by set difference: observed actors from the audit log, minus principals with current entitlement. For each, resolve whether the principal still exists (`users` / `identities` lookup by the id in `actorMetadata`) so the UI can distinguish "still here, access revoked" from "gone from the org entirely".

This is the highest-value output on the screen for rotation and incident response:

> 9 people have read this value. 3 of them cannot read it today.

It is also a strong rotation-simulation input, and it feeds the exposure score.

#### Retention bounds the negative claim

`auditLogsRetentionDays` is a plan feature (`backend/src/ee/services/license/license-types.ts:65`). The absence of reads therefore means "no reads inside a plan-bounded retention window", **not** "never".

**Never label anything "never used".** A customer on 30-day retention would see "never used" next to an identity that read the secret 40 days ago, and that single wrong label costs trust in the whole screen. The copy is "No reads in 30d", the window is stated in the legend, and the effective window is `min(requested window, plan retention)`.

#### Limitation: assume-privilege is invisible

`injectAssumePrivilege` (`backend/src/server/plugins/auth/inject-assume-privilege.ts`) stores the assumed-privilege details in request context, and the swap happens on local variables inside `getProjectPermission` (`permission-service.ts:568`). The audit log plugin never reads it.

So an admin who assumed an identity's privileges to read a secret is logged **as themselves**, with no record that they were using borrowed privileges. We get the human, which is usually what we want, but we cannot render the "acting as" chain.

Threading `assumedPrivilegeDetails` into `actorMetadata` is a small self-contained PR that is worth doing independently of this feature. Out of scope for the MVP; note the gap in the UI rather than implying the chain is covered.

**Performance warning**: `audit_logs` is the largest table in the system, jsonb filters on it are not free, and there is both a separate audit log database and a ClickHouse path (`audit-log-clickhouse-dal.ts`). For the MVP: bound the window to 30 days, cap rows, and put the query behind a DAL method with a matching signature in both DALs so the ClickHouse implementation can land later. Note the index requirement in the PR rather than discovering it in production.

### Leg 5: simulation (new, derived)

No new sources. A scoring function over legs 3 and 4.

```
Safe:
  - already rotation-managed (secret_rotation_v2_secret_mappings row exists)
  - every sync healthy (syncStatus ok, recent lastSyncedAt, isAutoSyncEnabled true)
  - every observed consumer read it after the last value change (they refetch)
  - referencing secrets resolve dynamically

Dangerous:
  - a sync with isAutoSyncEnabled = false (a human has to push it)
  - a sync in failed status (the new value will not land)
  - a consumer whose last read predates the last value change (caching, or dead)
  - an approval policy covers this path (rotation needs a human)
  - cross-project references or folder grants (blast radius leaves this project)
```

---

## 4. Scoring definitions

Pin these now so they do not get bikeshedded mid-build.

### Exposure score (0 to 100, higher is more exposed)

| Term | Max points | Input |
| --- | --- | --- |
| Read-value breadth | 25 | Count of principals with `readValue`, log-scaled |
| Ghost readers | 15 | Observed readers with `entitledNow: false`. `principalExists: false` weights higher |
| Unused entitlement ratio | 15 | `(entitled - observed) / entitled` |
| Distribution breadth | 15 | Count of destinations, cross-project counts double |
| Distribution health | 10 | Failed or manual-only syncs |
| Lifecycle | 10 | Time since last value change, and not rotation-managed |
| Escapes the project | 10 | Folder grants, cross-project references, external-Infisical syncs |

Bands, as settled in the approved wireframes: `low` 0 to 29, `elevated` 30 to 59, `high` 60 to 84, `critical` 85 to 100. `drivers` returns the top three contributing terms as human-readable strings, because the number alone is not actionable.

**The score has a fifth state: `unavailable`.** Two of its seven terms are computed from read activity, so a caller without audit-log permission cannot be given a number. Return `score: null` and `band: "unavailable"` rather than silently scoring them on the remaining terms, which would produce a different number for the same secret depending on who is looking at it.

### Rotation verdict

- **red** if any sync failed, any sync has auto-sync disabled, any consumer's last read predates the last value change, or an approval policy covers the path
- **amber** if distribution leaves the project, there is more than one destination, or consumer precision is folder-level only
- **green** otherwise, and explicitly green when rotation-managed with all syncs healthy

Always return `impacts[]` as plain sentences. The verdict opens the conversation; the list is what the user acts on.

**Ghost readers are not a reason to hold back.** They cut the other way: they are a reason the value should be rotated, because it is known to principals who cannot read it today. So the simulation returns **four** lists, per the approved wireframes:

| Field | UI heading | Contents |
| --- | --- | --- |
| `reasonsToRotate[]` | Why It Is Overdue Anyway | Ghost readers, an old `lastValueChangedAt`, no rotation configured, breadth of distribution |
| `impacts[]` | Will Break | Blocking items: failed syncs, manual-only syncs, consumers whose last read predates the current value |
| `worthKnowing[]` | Worth Knowing | Non-blocking consequences: importing folders that change at the same moment, entitled principals with no reads that this is a good moment to remove |
| `willUpdateAutomatically[]` | Will Update Automatically | Healthy syncs, references that resolve, consumers that fetch per request |

A secret can therefore be simultaneously "risky to rotate" and "overdue for rotation", which is the real situation most teams are in and the one no tool currently states out loud. The verdict sentence counts only `impacts[]`.

`willUpdateAutomatically[]` is not filler. A list of only problems reads as broken, and it is the half that tells the user what they do not have to think about.

---

## 5. Backend design

### Module layout

```
backend/src/ee/services/secret-blast-radius/
  secret-blast-radius-service.ts       # orchestration, scoring
  secret-blast-radius-dal.ts           # distribution-leg joins
  secret-blast-radius-attribution.ts   # per-source CASL attribution (pure)
  secret-blast-radius-attribution.test.ts
  secret-blast-radius-types.ts
```

Keep `-attribution.ts` pure over already-fetched rows so it is unit-testable with Vitest. Attribution is exactly the kind of logic that is wrong in subtle ways, and a test asserting "user reaches secret via group SRE, role prod-reader, rule `secretPath $GLOB /prod/**`" is worth more than any manual check.

Wiring:

- Route in `backend/src/ee/routes/v1/secret-router.ts`, next to `access-list`
- DI in `backend/src/server/routes/index.ts`, narrowing deps with `Pick<>`
- API docs strings in `backend/src/lib/api-docs/`

### Endpoints

```
GET /api/v1/secrets/:secretName/blast-radius
    ?projectId=&environment=&secretPath=&window=30d&include=entitlement,distribution,consumption
    &principalLimit=50&principalOffset=0&principalOrder=no-reads-first
  -> { blastRadius: {...} }

GET /api/v1/secrets/:secretName/rotation-simulation
    ?projectId=&environment=&secretPath=
  -> { simulation: { verdict, impacts[], warnings[] } }

GET /api/v1/projects/:projectId/exposure-ranking?limit=10
  -> { rankings: [...] }
```

Requirements the approved wireframes added, all of which land on the backend:

- **Pagination on principals, not just clustering.** The truncation screen distinguishes a rendering limit ("Showing 50 of 214, 164 not drawn at all") from a cluster ("+14 users", counted in the totals and expanded in place). "Draw 50 More" is a real request, so `principalLimit` / `principalOffset` are required, and `principalOrder=no-reads-first` has to sort server-side because the client only holds one page.
- **Filters apply to the full set, then the page is drawn.** The screen states this explicitly, so filtering cannot be client-side over the current page.
- **A last-read lookup that reaches outside the window.** The UI distinguishes "no reads in 30d" from "last read 46d ago, outside the window", which is a much stronger signal for rotation. That needs a second bounded query for `MAX(createdAt)` per actor, clamped to plan retention, separate from the in-window aggregate.
- **Folder-precision read counts are approximate and must be labelled as such.** The UI renders them with a leading `~` (`~312 reads`) and exact counts without it. Return `precision` and let the client apply the tilde; do not bake it into a string.
- **Client aggregation.** `userAgentType` collapses into the `clients[]` array per principal, ordered by frequency, since the UI shows two plus an overflow count.

Two deliberate choices:

- `include` exists because the consumption leg is the slow one. The graph paints entitlement and distribution immediately, then upgrades when consumption returns.
- `rotation-simulation` is a `GET`, not a `POST`. It computes and returns; it has no side effects and needs no body. Keeping it a `GET` avoids an RPC-shaped deviation from REST that `CODE_QUALITY.md` would require us to flag.

### Response contract

Pin this early; the frontend builds against it.

```ts
type TBlastRadius = {
  secret: {
    id: string;
    key: string;
    environment: string;
    secretPath: string;
    folderId: string;
    lastValueChangedAt: string;
    isRotationManaged: boolean;
  };
  exposure: {
    score: number | null;                                          // null when band is "unavailable"
    band: "low" | "elevated" | "high" | "critical" | "unavailable";
    drivers: string[];
  };

  principals: Array<{
    id: string;
    name: string;
    type: "user" | "identity" | "group";
    actions: ProjectPermissionSecretActions[];
    observed: {
      readCount: number;                 // inside the window
      lastReadAt: string | null;         // may predate the window, see lastReadOutsideWindow
      lastReadOutsideWindow: boolean;    // drives "last read 46d ago, outside the window"
      precision: "secret" | "folder";    // folder counts are approximate; the UI prefixes them with ~
      clients: Array<"web" | "cli" | "k8-operator" | "terraform" | "sdk" | "other">;
    };
    grantPaths: Array<{
      via: Array<
        | { kind: "membership"; role: string; isTemporary: boolean; expiresAt?: string }
        | { kind: "group"; groupId: string; groupName: string; role: string }
        | { kind: "additionalPrivilege"; privilegeId: string; name: string; expiresAt?: string }
      >;
      condition?: { field: string; operator: string; value: unknown };
    }>;
  }>;

  destinations: Array<{
    kind: "sync" | "import" | "replication" | "reference" | "folderGrant" | "proxiedService";
    id: string;
    label: string;
    provider?: string;
    status?: "healthy" | "stale" | "failed";
    lastSyncedAt?: string;
    autoSync?: boolean;
    crossProject: boolean;
    destinationKey?: string;
  }>;

  consumers: Array<{
    actorId: string;
    actorType: "user" | "identity" | "service" | "platform" | "unknownUser";
    label: string;                 // email for users, name for identities
    authMethod?: string;
    clients: Array<"web" | "cli" | "k8-operator" | "terraform" | "sdk" | "other">;
    source?: { kind: "kubernetes" | "aws" | "oidc"; detail: string };
    lastReadAt: string;
    readCount: number;
    precision: "secret" | "folder";
    entitledNow: boolean;          // false makes this a ghost reader
    principalExists: boolean;      // false means removed from the org entirely
  }>;

  // Observed readers with entitledNow === false, surfaced separately so the UI
  // does not have to derive the set. Same shape as consumers.
  ghostReaders: Array<TBlastRadius["consumers"][number]>;

  window: { requestedDays: number; effectiveDays: number; boundByRetention: boolean };

  // Counts, not booleans. The UI states "Showing 50 of 214 principals" and breaks the
  // remainder down by whether they have reads, so the numbers stay complete even when
  // the canvas does not.
  truncated: {
    principals: { drawn: number; total: number; notDrawnWithReads: number; notDrawnWithoutReads: number };
    destinations: { drawn: number; total: number };
    consumers: { drawn: number; total: number };
  };
};
```

`truncated` is not optional. `CODE_QUALITY.md` calls out silent truncation, and a graph that quietly drops nodes is worse than useless during an incident because it reads as completeness.

### Correctness and quality checklist

- **Auth**: copy the `access-list` route's checks. Caller needs `DescribeSecret` on the target secret. Enumerating every principal in a project is a real disclosure, so gate the principals leg on member-read permission too.
- **The consumption leg needs its own gate: audit-log read permission.** Per-person read activity is employee monitoring data. The data is not new, since audit logs already expose it, but surfacing it in a prominent new UI must not hand a per-person activity report on colleagues to anyone who can merely see a secret's metadata. A caller without the audit-log permission gets the graph with entitlement and distribution and no consumption leg, not a 403 on the whole view. Some jurisdictions attach obligations to employee activity monitoring (German works councils being the standard example), which is another reason the leg is separately gated and separately omittable.
- **Plan gate**: reuse `plan.secretAccessInsights` for the MVP so the license service does not need touching. Split into its own flag before GA.
- **Never return the secret value.** Not in a node, not in a tooltip, not in the simulation payload. `getSecretAccessList` passes `viewSecretValue: false` for exactly this reason.
- **Validate every input**: reuse `SecretNameSchema`, the env slug schema, a bounded `secretPath`. `window` is an enum (`7d` / `30d` / `90d`), never a free string. `limit` is `z.coerce.number().int()` with a max.
- **No transactions.** Entirely read-only. Watch the connection budget instead: batch the distribution joins into a handful of queries rather than one per node, and hard-cap fan-out depth on imports and references, which can cycle.
- **Rate limit**: `readLimit`.
- **Errors**: no raw Knex errors out. A secret in another project returns `NotFoundError`, not `ForbiddenRequestError`.

---

## 6. Frontend design

### File layout

```
frontend/src/pages/secret-manager/BlastRadiusPage/
  route.tsx
  BlastRadiusPage.tsx
  components/
    BlastRadiusGraph.tsx
    ExposureHeader.tsx
    ExplainPanel.tsx
    RotationSimulationModal.tsx
    BlastRadiusFilters.tsx
    BlastRadiusTableMode.tsx
    nodes/{PrincipalNode,SecretNode,DestinationNode,ClusterNode}.tsx
    edges/{ObservedEdge,EntitledEdge}.tsx
  utils/{buildGraph.ts,positionElements.ts,scoreCopy.ts}

frontend/src/hooks/api/blastRadius/{queries.tsx,types.ts,index.ts}
```

Routing follows the existing convention:

- `route.tsx` uses `createFileRoute("/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/blast-radius")`
- Register in `frontend/src/routes.ts` next to the `insights` entry (line 27)
- Add to `frontend/src/const/routes.ts` under `SecretManager`

Use `@app/components/v3` components and the v3 tokens from `DESIGN.md`. Never raw `mineshaft-*` values.

### Entry points

1. **Secret row overflow menu**, next to the existing access insights item in `SecretEditTableRow.tsx`. Label: "Blast radius".
2. **Deep-linkable route**: `?env=&path=&key=&focus=`, so an incident responder can paste the exact view into Slack. Five lines of code, materially changes how the feature gets used.
3. **Insights page card**: "Most exposed secrets", top ten by score, click through to the graph.

### Layout

```
  WHO CAN REACH IT                  THE SECRET                  WHERE IT GOES

  ┌──────────────┐                                          ┌────────────────────┐
  │ 👤 alice     │══════════╗                        ╔══════│ AWS Secrets Mgr    │
  │ readValue    │          ║                        ║      │ ✓ synced 4m ago    │
  └──────────────┘          ║                        ║      └────────────────────┘
                            ║   ┌────────────────┐   ║
  ┌──────────────┐          ╠══>│                │═══╣      ┌────────────────────┐
  │ 👥 SRE  (8)  │──────────╣   │  DB_PASSWORD   │   ╠══════│ GitHub: api-server │
  │ via glob     │          ║   │  /prod  prod   │   ║      │ ⚠ failed 3d ago    │
  └──────────────┘          ║   │                │   ║      └────────────────────┘
        ▲ expand            ║   └────────────────┘   ║
                            ║      ▲          ▲      ║      ┌────────────────────┐
  ┌──────────────┐          ║      │          │      ╚──────│ imported by        │
  │ 🤖 payments  │══════════╝      │          │             │ /staging/api       │
  │ k8s: prod ns │                 │          │             └────────────────────┘
  └──────────────┘          rotation-managed  approval

  ┌──────────────┐   ═══ observed (read in last 30d)
  │ 🤖 legacy-cd │───   ─── entitled, never used
  │ never used   │───
  └──────────────┘
```

Three bands, left to right, secret in the center. React Flow with a dagre layout, forking `AccessTree/utils/positionElements.ts`.

### Encoding rules

| Channel | Meaning |
| --- | --- |
| Solid double edge | Observed in the window. Thickness scales with read count |
| Dashed thin edge | Entitled, never exercised |
| Edge color | `--color-danger` for `readValue`, `--color-warning` for write actions, `--color-neutral` for describe-only |
| Node badge | "via group", "expires in 3h", "admin", "never used", "cross-project", "folder-level precision" |
| Destination status dot | `--color-success` synced, `--color-warning` stale, `--color-danger` failed |
| Cluster node | Collapsed principals of one type with a count, expands on click |

`--color-secret` and `--color-folder` already exist as product-area accents, so the center node and folder nodes get canonical colors for free.

### Interactions, in build priority order

1. **Click any node: focus mode.** Everything not on a path to that node dims to 20%. The highest-value interaction in a graph this dense, and nearly free to implement.
2. **Click an edge: the Explain panel.** A right-hand sheet rendering the grant path as a chain, then the action:

```
  alice@acme.com  can read this value

    ├─ member of group  SRE
    ├─ group holds role  prod-reader
    └─ matched rule      secretPath  $GLOB  /prod/**
                         environment $IN    [prod, prod-eu]

  Observed:  read 1,204 times, last 6 minutes ago

  [ Restrict rule ]  [ Remove from group ]  [ View audit log ]
```

   The actions turn a dashboard into a product. `SecretAccessInsights.tsx` already implements inline grant flows (`useCreateProjectUserAdditionalPrivilege`, add-to-project), so the revoke direction has a working model to mirror.

3. **Filter bar**: action type, principal type, hide never-used, only paths through groups, only cross-project. Filters change the graph, not a table below it.
4. **Table toggle.** Graphs are bad at "give me the list of 40 identities." The existing access-insights table becomes this mode. Ship both, default to graph.
5. **Simulate rotation** in the header, opening a modal that colors the destination band by what breaks and lists impacts as plain sentences.

### Progressive disclosure

Real projects are big, so this is not optional.

- Render clusters first, expand on demand. Reuse `ShowMoreButtonNode.tsx` and the `INITIAL_FOLDERS_PER_LEVEL` / `FOLDERS_INCREMENT` pattern from `AccessTree/hooks/index.ts:23`.
- Paint entitlement and distribution immediately, then stream consumption in when the slow query returns, upgrading dashed edges to solid as it arrives. Animating that upgrade is the one place a flourish earns its keep, because the upgrade *is* the insight.
- The healthy empty state matters: a secret readable only by two admins with no syncs should look calm and affirmative, not like a broken page.

---

## 7. Task breakdown

> **Status: implemented end to end.** Backend, frontend, and the demo seed are in the working tree.
> `type:check` and `lint:fix` are clean on both packages, 24 new unit tests pass, and both endpoints were
> exercised against the local dev database with a real session: the graph returns live principals with
> resolved grant paths, three ghost readers, deduplicated destinations, and a red rotation verdict.
> Implementation decisions that differ from this plan are recorded in [section 10](#10-implementation-notes).

### Phase 0: setup

- [x] Create `backend/src/ee/services/secret-blast-radius/` with types file only, and agree the `TBlastRadius` contract with whoever builds the frontend
- [x] Seed script skeleton (see Phase 6) so there is real data to develop against from day one

### Phase 1: graph payload, entitlement plus distribution

- [x] Service skeleton, DAL, route in `ee/routes/v1/secret-router.ts`, DI wiring
- [x] Auth and plan gate copied from `access-list`
- [x] Zod input validation using shared schemas
- [x] Entitlement leg by calling `getProjectPermissions`, mapped into `principals[]` with empty `grantPaths`
- [x] Distribution leg: syncs by `folderId`, imports by env plus path, reverse `secret_references_v2`, rotation mappings
- [x] `truncated` flags with explicit caps
- **Acceptance**: `curl` returns a populated payload for a real project, principals and destinations both non-empty, no secret values anywhere in the response

### Phase 2: grant-path attribution

- [x] `secret-blast-radius-attribution.ts`: build one ability per grant source, preserving per-principal handlebars metadata interpolation
- [x] Extract the deciding rule via `relevantRuleFor`, map its `conditions` into the `condition` field
- [x] Group paths: group to role to rule, then expand to members
- [x] Temporary grants surface `expiresAt`
- [x] Unit tests: direct role, custom role, group-inherited, additional privilege, ABAC glob match, temporary grant
- **Acceptance**: every principal with access has at least one non-empty `grantPaths` entry, and the tests above pass

### Phase 3: consumption leg

- [x] DAL method on both `audit-log-dal.ts` and `audit-log-clickhouse-dal.ts` with a matching signature
- [x] Separate audit-log read permission gate; omit the leg rather than failing the request when the caller lacks it
- [x] Bounded window (enum), clamped to plan retention, returned as `window.effectiveDays` with `boundByRetention`
- [x] Row cap, `truncated.consumers` when capped
- [x] Per-consumer `precision` field, correctly `folder` for `get-secrets` and `secret` for `get-secret`
- [x] Resolve user consumers to `email` from `actorMetadata`; handle `service`, `platform`, and `unknownUser` actor types rather than assuming user-or-identity
- [x] Collapse `userAgentType` into the `clients[]` array so one person's browser and CLI reads are distinguishable
- [x] Decorate identity consumers with `actorMetadata.kubernetes` / `.aws` / `.oidc` detail
- [x] Join consumption onto `principals[].observed`
- [x] **Ghost readers**: set difference of observed actors minus currently entitled principals, with a `principalExists` lookup against `users` / `identities` to separate "access revoked" from "gone from the org"
- [x] Second bounded lookup for last read **outside** the window, clamped to plan retention, feeding `lastReadOutsideWindow`
- [x] `clients[]` ordered by frequency so the UI's "two plus overflow" picks the right two
- [x] Server-side `principalOrder=no-reads-first`, and `principalLimit` / `principalOffset` with filters applied to the full set before the page is cut
- [x] Note the index requirement in the PR description
- **Acceptance**: a principal that read the folder yesterday shows `observed.readCount > 0` with `precision: "folder"`; one with no reads in the window shows `lastReadAt: null`; a user removed from the granting group after reading appears in `ghostReaders` with their email intact

### Phase 4: scoring and simulation

- [x] Exposure score per the table in section 4, with `drivers[]`, four bands, and the `unavailable` state when the caller has no audit-log permission
- [x] `GET /rotation-simulation` returning the verdict plus all four lists (`impacts`, `reasonsToRotate`, `worthKnowing`, `willUpdateAutomatically`) as plain sentences
- [x] Unit tests on both scoring functions, including the green-when-rotation-managed case and the score-is-null-without-audit-access case
- **Acceptance**: the seeded hero secret scores `high` with sensible drivers, and simulation returns `red` naming the failed sync

### Phase 5: frontend

- [x] `hooks/api/blastRadius/` queries and types
- [x] Route, page shell, registration in `routes.ts` and `const/routes.ts`
- [x] `buildGraph.ts`: payload to React Flow nodes and edges, with cycle guard
- [x] Dagre layout forked from `AccessTree/utils/positionElements.ts`
- [x] Four node types, two edge types, the solid-versus-dashed encoding
- [x] `ExposureHeader` with score, band, drivers, and the Simulate button
- [x] Focus mode
- [x] `ExplainPanel` with the grant chain and its actions
- [x] Filters
- [x] `RotationSimulationModal`
- [x] Progressive paint: entitlement and distribution first, consumption upgraded in
- [x] Table mode toggle wired to the existing access-insights table
- [x] Deep-link params
- [x] Entry point in `SecretEditTableRow.tsx`, with the exposure score in the menu item
- [x] Loading, healthy, and truncated states
- [x] No-audit-permission state: score reads `Unavailable` with its reason, every edge dashed, `activity hidden` on each node, ghost band absent, and the solid variant omitted from the legend rather than shown as unreachable
- [x] Truncation state: "Showing 50 of 214 principals" with the not-drawn breakdown, "Draw 50 More", and "Open Table Mode"
- **Acceptance**: the seeded story reads correctly on a projector at default zoom without manual panning

### Phase 6: demo

- [x] Seed script producing the story below
- [x] Insights page "Most exposed secrets" card (cut first if time is short)
- [x] 90-second demo path, rehearsed
- [x] `make reviewable-api` and `make reviewable-ui` both clean

### Seed story

The demo is the deliverable, so the data has to tell a story:

- `prod` and `staging` environments, with `/prod/db/PASSWORD` as the hero secret
- a group `SRE` with 8 members holding a custom role whose ABAC condition is `secretPath $GLOB /prod/**`, granting far more than whoever wrote it intended
- a contractor user nested into that group two levels deep
- three identities: one Kubernetes auth (so `actorMetadata.kubernetes` renders a namespace and service account), one AWS auth, one stale CI identity that has never read anything
- two syncs: one healthy, one failed, so simulation has something real to warn about
- a `/staging/api` folder importing the prod path, because the cross-environment leak is the moment the room reacts
- **a former team member** who read the secret three weeks ago and was then removed from the `SRE` group, plus one deleted identity that also read it, so the ghost-reader band is populated. "Two people who read this value cannot read it today" is the strongest single line in the demo
- inserted `audit_logs` rows so the observed leg is populated without waiting for traffic, with a mix of `web` and `cli` user agents on the same user so the client distinction is visible

### Cut list, in order

1. Legacy `integrations` edges
2. Proxied-service edges
3. Honey-token adjacency

Everything else on the original cut list was built: the org-level exposure ranking card, table mode, and
cross-project folder grants all ship. Legacy integrations remain the one distribution edge that a
pre-v3 project would show and this view would not.

---

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Audit log query is slow on a real project | 30-day window, row cap, ClickHouse-shaped DAL interface, note the index requirement |
| Attribution is subtly wrong and nobody notices | Pure functions plus unit tests per grant-source type. This is the one place tests are non-negotiable |
| Graph is unreadable on a real project | Clusters first, expand on demand, focus mode, hard node caps with visible `truncated` state |
| Overlap with the shipped access-list confuses reviewers | Frame the PR as "legs 2 to 5"; leg 1 explicitly calls the existing service |
| Connection pool exhaustion under load | Read-only, no transactions, batched joins, `readLimit` rate limit |
| Consumption precision is oversold | `precision` field on every consumer, surfaced in the UI as a badge |
| A negative claim is wrong because retention is shorter than the window | Never render "never used". Copy is "No reads in 30d", window clamped to plan retention and stated in the legend |
| Per-person activity data reaches someone who should not have it | Consumption leg gated on the audit-log read permission and omitted, not 403'd, when absent |
| Assume-privilege reads look like ordinary user reads | Known limitation, noted in the UI. Fix is a separate PR threading `assumedPrivilegeDetails` into `actorMetadata` |

---

## 9. Where it goes after the hackathon

1. **Access review workflow.** Ranked over-provisioning findings ("47 entitled, 6 observed"), one-click revoke, exported evidence pack. A security-team seat rather than a platform-engineer seat, which is a different budget.
2. **Reachability diffing in CI.** A check that fails when a PR widens who can reach a prod path. The preventive version, and where Vault's Sentinel users are unhappy.
3. **Rotation confidence as the on-ramp to rotation revenue.** The blocker to rotation adoption is fear of breakage, and rotation is the paid surface.
4. **Drift and growth alerts.** Register a provider on the existing `backend/src/services/alert/` module and blast radius becomes a notification stream: "the set of principals reaching /prod/db grew by 9 this week."

---

## 9a. Running it locally

The feature is gated on `plan.secretAccessInsights`, the same flag as the shipped Secret Access Insights.
A dev stack with no license key therefore shows the upgrade modal rather than the graph.

```bash
# 1. Seed the demo story onto an existing dev project (idempotent)
docker exec -i monorepo-db-1 psql -U infisical -d infisical \
  -v project_slug="'<your-project-slug>'" -v env_slug="'prod'" -v folder_name="'<folder>'" \
  < backend/scripts/blast-radius-demo-seed.sql

# 2. Either point the stack at a license key, or flip the default for a local demo only:
#    backend/src/ee/services/license/license-fns.ts -> secretAccessInsights: true
#    (revert before committing; it is an instance-wide entitlement default)

# 3. Open a secret's row menu in the Secrets overview and pick "View Blast Radius", or deep link:
#    /organizations/$orgId/projects/secret-management/$projectId/blast-radius
#      ?secretKey=SLACK_WEBHOOK&environment=prod&secretPath=/webhooks
```

The seed leaves one sync failing, one sync manual, three ghost readers (one still in the org with access
revoked, two deleted), and a value 412 days old, which is enough for the red rotation verdict and both
halves of the simulation.

## 10. Implementation notes

Decisions taken while building phases 1 to 4 that differ from, or add to, the plan above.

**An approval policy is not breakage.** Section 4 originally made a covering approval policy a `red`
verdict. It ships in `worthKnowing` instead, because a policy adds a reviewer rather than breaking a
push. Keeping it out of the verdict means "not safe to rotate" always means something is genuinely
going to break, which is what makes the verdict worth reading.

**The exposure score requires the consumption leg.** Two of its seven terms come from read activity,
so the score is `null` with `band: "unavailable"` whenever activity is missing, whether that is because
the caller lacks audit-log permission or because they asked for the fast legs only. Scoring the
remaining terms would publish a number that changes for the same secret depending on who is looking, or
silently changes when the second request lands.

**Attribution runs on the page being drawn, not the head of the list.** Paging to principals 50 to 100
resolves that page's grant paths. Capped at 60 per request, since each principal costs one membership
read.

**Grant-source resolution landed in the permission service, not in blast radius.**
`permissionService.getProjectPermissionSources` returns one ability per grant source for a set of
actors, reusing `buildProjectPermissionRules` and the same handlebars metadata interpolation the merged
ability uses. Duplicating that in a feature module would have let ABAC evaluation drift between "can
they?" and "how?". It is generic on purpose: an access-review feature wants exactly this call.

**The consumption aggregate is Postgres-only.** `auditLogDAL.aggregateSecretReadActivity` and
`findLastSecretReadBefore` are implemented on the Postgres DAL, matching how Insights already
aggregates (`countByDateAndActor` and friends are Postgres-only too, and the ClickHouse DAL exposes
only `find`). A ClickHouse implementation is follow-up work for deployments that keep long retention
there and short retention in Postgres.

**Filters are server-side, and the ranking scores real secrets.** Principal filters (`principalAccess`,
`principalUsage`) apply to the whole set before the page is cut, so paging a filtered graph walks the
filtered set. `GET /insights/secrets/exposure-ranking` scores secrets with the same function the single
secret view uses rather than estimating: a SQL prefilter picks candidates by distribution breadth and value
age, the project-wide permission pass is fetched once and reused, and only the top slice gets an audit-log
aggregate. A secret with no syncs and a fresh value cannot appear, which is the secret that would not have
ranked anyway.

**The Explain panel navigates rather than mutates.** Revoking access from a read-only graph would put a
destructive action two clicks from a hover, and the role editor and access page already own those flows
with their guards and approval paths, so the actions deep-link there.

**e2e coverage needed a fixture change.** `src/ee/services/license/__mocks__/license-fns.ts` omitted
`secretAccessInsights`, so every request in the e2e environment hit the plan gate. The mock now grants it,
which is what makes `e2e-test/routes/v1/secret-blast-radius.spec.ts` able to assert real payloads instead
of only asserting the gate. That spec has not been run locally: the e2e environment drops and reseeds the
`public` schema, so it must never be pointed at a dev database, and the QUIC native binding it loads is
missing on darwin-arm64. CI runs it inside the FIPS image.

**Index follow-up before this ships to a large tenant.** Both audit-log queries filter on
`eventMetadata->>'environment'` and `eventMetadata->>'secretPath'` after `projectId` + `eventType` +
`createdAt`. On the dev dataset that is instant; on a real tenant it needs either an expression index on
those two jsonb paths or the ClickHouse path above. Measured before enabling for large orgs, not after.

## Appendix: design brief

A self-contained brief for producing screens lives in [`BLAST_RADIUS_DESIGN_BRIEF.md`](./BLAST_RADIUS_DESIGN_BRIEF.md).
