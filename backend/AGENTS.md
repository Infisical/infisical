# Backend

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

**Read [`CODE_QUALITY.md`](CODE_QUALITY.md) before any change in this package, and check the change against it, whatever the change is, before calling the task done.** This file covers *where* code goes and *which* pattern to follow; the quality guide covers the minimum any implementation has to handle. It is a deliberately non-exhaustive floor, so the topics it happens to cover are not a filter for whether it applies.

## Essential Commands

All commands run from the `backend/` directory:

- `npm run dev` — start dev server with tsx watch + pino-pretty logging (`dev:docker` is the same with the debugger on 9229)
- `npm run build` — production build via tsdown (`tsdown.config.ts`) with sourcemaps
- `npm run lint:fix` — ESLint autofix
- `npm run type:check` — TypeScript check (uses 8GB heap)
- `make reviewable-api` (from repo root) — runs `lint:fix` + `type:check` (run before PRs)

The backend runs on Node 26. TypeScript files run directly through tsx (dev server, scripts, the
`*-dev` knex commands, and the e2e environment's migration loading); there is no ts-node.

### Build (tsdown)

`tsdown` compiles every module to its own `dist/**/*.mjs` (unbundled ESM) and rewrites `@app/*` to
relative paths itself. Invariants that a config change can silently break:

- **The output extension stays `.mjs`.** knex records each migration's file name, extension included, in
  `infisical_migrations`, so production rows are `*.mjs`. A different extension makes every applied
  migration look unknown and the boot check refuses to start.
- **`main` stays the first entry, and entry paths stay absolute.** Rolldown orders each file's imports by
  execution order, walking entries in order; a glob that sorts another entry ahead of `main` hoists its
  imports above the telemetry instrumentation. Object entries ignore `root`, so relative paths nest every
  other module under `dist/src/`.
- **Rolldown reorders imports, even within one file.** Never rely on import order for a global side effect
  that another package needs; import it explicitly where it is needed (see `reflect-metadata` in
  `lib/crypto/pqc/pqc-algorithm.ts`).
- **`deps.onlyBundle: []` fails the build if a `node_modules` package would be inlined.** That means
  `src/` imports a package that `package.json` does not declare; declare it instead of loosening the guard.

### Testing

Run both suites from the repo root, which is the same entry point CI uses:

- `make test-api-unit` — unit tests matching `./src/**/*.test.ts`
- `make test-api-e2e` — e2e tests matching `./e2e-test/**/*.spec.ts`
- `make test-api-e2e SPEC=<pattern>` — narrow to one spec, e.g. `SPEC=secret-sync`
- `make up-rotation-databases` — start the databases the secret rotation specs need, required
  only for a full run (`docker-compose.e2e-dbs.yml`, and the Oracle image is large)
- `make down-test-suite-containers` — stop everything when finished

The secret rotation specs reach their databases by compose service name, so
`docker-compose.e2e-dbs.yml` pins the same compose project as the test stack and shares its
network. Without `make up-rotation-databases`, those specs fail on connection; the rest pass.

Both run inside the FIPS image (`Dockerfile.dev.fips`), which carries the native dependencies
the suites need (SoftHSM2, the Oracle client, the FIPS OpenSSL build) and pins the Node
version, so the host's does not matter. `docker-compose.test.yml` declares the image,
environment, mounts and services; `src`, `e2e-test` and both vitest configs are mounted, so
editing a test needs no rebuild but changing `package.json` or `tsconfig.json` does.

**`npm run test:e2e` directly is possible but destructive if misconfigured.** The Vitest
environment runs `DROP SCHEMA public CASCADE` on whatever database `.env.test` points at,
before every run. Copy `.env.test.example`, which targets the throwaway stack, and start it
with `make up-test-suite-containers`. Never point it at the dev database.

Unit tests go next to source as `*.test.ts` and test pure functions with Vitest globals (`describe`, `test`, `expect`).

E2E tests live in `e2e-test/routes/`. The custom Vitest environment (`e2e-test/vitest-environment-knex.ts`) bootstraps a full server with DB, Redis, and encryption. Tests use injected globals: `testServer` (Fastify instance), `jwtAuthToken` (pre-authenticated JWT). Use `testServer.inject()` for HTTP assertions. Test helpers in `e2e-test/testUtils/` provide CRUD wrappers for secrets, folders, and secret imports. See `e2e-test/routes/v1/org.spec.ts` for a representative e2e test.

#### Writing e2e tests with `testUtils`

**Build test state with the helpers in `e2e-test/testUtils/`, not by hand.** Before writing a
`testServer.inject` call or a `testDb` insert to set something up, check `testUtils/` for a helper
that already does it. If none exists, add one there rather than a local helper in the spec: two
specs had each written their own `createTargetUser` before `testUtils/users.ts` existed, and every
copy drifts on its own.

- **Isolate each test.** `createIsolatedOrgAndProject` (`fixtures.ts`) gives a test its own org and
  project, a token scoped to it, and a `cleanup` that deletes the org. Prefer it over the shared
  `seedData1` org and project, whose state leaks between tests and files.
- **Don't lean on the seed user as a participant.** When a test needs someone other than the caller
  (a recipient, a member, a target), create them with `createUser` and `addUserMembership`
  (`users.ts`). Those write rows directly because signup needs SRP, so the user can be named but
  cannot log in.
- **Go through the API for everything else**, with the domain helpers (`secrets.ts`, `folders.ts`,
  `alerts.ts`, `reminders.ts`, `identities.ts`, ...). Write a helper with `request()` (`request.ts`)
  so a call is sent when made and a caller can `.expect()` a non-200 or take the `.raw()` response.
- **Assert on outcomes a user would see**: an API response, an email in `testSmtp`, a message at a
  fake destination. Read `testDb` only when the API cannot show the thing under test (eg an alert
  orphaned by a cascade), and say why in a comment.
- **Wait with `pollUntil`** (`poll.ts`) for anything asynchronous, never a fixed sleep.
- **Run background jobs on demand** through a pass-through wrapper in `e2e-test/fakes/` (eg
  `reminder-queue.ts` and `event-outbox-queue.ts`, driven by `runDailyReminders` in `reminders.ts`).

#### Faking a third-party provider

**Never add test-only code to `src/`** — no test-mode enum members, no lookup map entries, no
`isTestMode` branches. Replace the module instead, from `test.alias` in
`vitest.e2e.config.mts`, with a double under `e2e-test/fakes/`. Production code stays unaware
a fake exists. `e2e-test/fakes/aws-parameter-store-sync-fns.ts` and its connection counterpart
are the worked examples, and the pre-existing `./license-fns` alias is the precedent.

Four things decide whether this works:

- **Alias the narrowest specifier.** Entries match the import string, so aliasing one a single
  file imports (a barrel's `./x-fns` re-export) swaps that seam and leaves the constants,
  schemas, types, router and lookup maps real.
- **`test.alias` must stay an array.** Vite's `mergeAlias` concatenates arrays with
  `test.alias` first, but merges two objects, where the generic `@app` prefix matches before a
  specific `@app/...` entry and the fake silently stops applying with no error.
- **Re-export whatever you do not replace.** The alias swaps the whole module, so an export you
  omit stops existing for every importer of it.
- **Assert the fake still matches.** Nothing otherwise checks it against the module it
  replaces. Export an assignment typed as `Pick<typeof RealModule, …>` so a signature change
  fails type-checking rather than leaving the fake quietly wrong.

A fake must reproduce the contract under test, not merely record its input. The Parameter Store
fake reimplements the real reconciliation rules (skip empty writes, delete absent keys unless
deletion is disabled, respect the key schema), because those rules are the behavior the specs
exist to pin.

#### FIPS test image and the prebuilt toolchain

CI (`.github/workflows/run-backend-tests.yml`) runs the e2e suite inside a FIPS image built
from `Dockerfile.dev.fips`. The expensive, rarely-changing parts of that image (SoftHSM2,
Oracle Instant Client, the FIPS OpenSSL 3.1.2 build and the PQC OpenSSL 3.5.6 build) live in
**`Dockerfile.fips-toolchain`**, which is published to
`ghcr.io/infisical/backend-fips-toolchain` for amd64 and arm64 by
`.github/workflows/publish-fips-toolchain.yml` on pushes to `main`.

`Dockerfile.dev.fips` consumes it via the `TOOLCHAIN_IMAGE` build arg, so CI and local dev
pull the toolchain instead of spending ~15min compiling it. Consequences worth knowing:

- **Editing `Dockerfile.fips-toolchain` is expensive.** CI pins the image by the content hash
  of that file, so a PR touching it has no published tag and rebuilds from source (the old,
  slow path). It publishes once the PR lands on `main`. Keep app-level changes in
  `Dockerfile.dev.fips`.
- **Don't add `cache-to: type=gha` back to the image build.** GHA cache is PR-scoped (so it
  never hits on a PR's first run) and the repo's 10GB cache budget is already full; writing
  image blobs there evicts the `node_modules` caches of every workflow.
- **The published image is an internal CI build cache, not a supported artifact.** It is
  public only so CI and local dev can pull it; it carries no support or compatibility
  guarantee. It is *not* the FIPS product image; that one is `infisical/infisical-fips`,
  built from `Dockerfile.fips.standalone-infisical`. OCI labels on the image say the same.
- **Keep every third-party fetch pinned and checksummed.** SoftHSM2 is pinned to a commit
  SHA (tags are mutable); both OpenSSL tarballs and the Oracle Instant Client zip are
  SHA256-verified; the Infisical CLI apt package is version-pinned. Oracle Instant Client
  is redistributed under the Oracle Free Distribution, Hosting, and Use Terms, which
  require the license to travel with it, so `/opt/oracle/instantclient_23_26/BASIC_LICENSE`
  must not be removed.

##### Building the dev stack without GHCR

`docker compose -f docker-compose.dev.yml build backend` pulls the toolchain from GHCR by
default. If GHCR is down, the package is private, you're offline, or you're iterating on the
toolchain itself, build it locally once and point the compose build at it:

```bash
# 1. Build the toolchain from source (~15min, or ~2min if your layer cache is warm)
docker build -f backend/Dockerfile.fips-toolchain -t fips-toolchain:local backend

# 2. Prefer .env, so it survives every compose invocation (see the warning below)
echo 'TOOLCHAIN_IMAGE=fips-toolchain:local' >> .env

# ...or pass it per-invocation. Both forms work but are easy to forget:
TOOLCHAIN_IMAGE=fips-toolchain:local docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml build --build-arg TOOLCHAIN_IMAGE=fips-toolchain:local backend
```

**Use `.env` rather than a one-off env var.** The documented start command in
`docs/contributing/platform/developing.mdx` is `up --build`, which rebuilds the backend and
re-resolves the `TOOLCHAIN_IMAGE` default, so a per-invocation override silently stops
applying and you're back to a failing GHCR pull. Compose interpolates the project `.env` for
every invocation, so putting it there sticks.

Notes:

- Step 1 is only needed once per change to `Dockerfile.fips-toolchain`. The local tag name is
  arbitrary; it just has to match what you point `TOOLCHAIN_IMAGE` at.
- An already-built `backend` image keeps working if GHCR is unreachable, as long as you don't
  pass `--build`. This only bites on a rebuild.
- This is not an offline story. The toolchain build itself still fetches Debian packages, both
  OpenSSL tarballs, SoftHSM sources, and the Oracle client. With no network at all, neither
  path works and you need a previously built image.

### Database

- `npm run migration:new` — create new migration (interactive prompt)
- `npm run migration:latest-dev` — run pending migrations (dev, uses `src/db/knexfile.ts`)
- `npm run migration:rollback-dev` — rollback last migration batch (dev)
- `npm run generate:schema` — regenerate Zod types from DB into `src/db/schemas/` (always run after migration changes)
- `npm run seed-dev` — run database seeds

- **Every foreign-key column must be covered by an index** (its own, or as the leftmost column of a composite index). Postgres does **not** auto-index FK columns. This holds regardless of cascade behavior: an unindexed FK forces a seq-scan of the child table on every parent `DELETE`/`UPDATE` (per-row RI trigger), and the FK column is almost always also a join/filter key. Watch helper-generated FKs — `createJunctionTable` (`src/db/utils.ts`) creates CASCADE FK columns with **no index** on either side.

### Scaffolding

- `npm run generate:component` — interactive generator that can create a service module (DAL + service + types), a standalone DAL, or a router

Path alias: `@app/*` maps to `./src/*`.

## ESLint & Import Ordering

Config in `.eslintrc.js`. Uses `simple-import-sort` with this group order:
1. Side-effect imports
2. `node:` builtins
3. Third-party packages
4. `@app/` imports
5. `@lib/` imports
6. `@server/` imports
7. Relative imports

## Architecture

### Service Factory + Manual DI

No IoC container. Every service is a factory function that receives explicit dependencies as a typed object and returns an object of methods. Dependencies are narrowed with TypeScript `Pick` to define minimal interface contracts.

The entire dependency graph is manually wired in `src/server/routes/index.ts`:
- **~line 480-646**: DAL instantiation — each DAL factory receives the `db` client
- **~line 649-2800**: Service instantiation — each factory receives its DALs + other services
- **~line 2831-2972**: `server.decorate("services", {...})` exposes ~100+ services as `server.services.*`
- **~line 3082-3098**: Route registration — EE routes registered before community routes per API version

See `src/services/secret/secret-service.ts:104-162` for a representative factory with ~20 dependencies. See `src/services/user/user-service.ts` for a simpler example (~8 dependencies).

### DAL Layer (Data Access)

Each service has a `*-dal.ts` that wraps `ormify()` (defined in `src/lib/knex/index.ts:155-326`). `ormify()` provides typed CRUD methods: `findById`, `find`, `findOne`, `create`, `insertMany`, `batchInsert`, `upsert`, `updateById`, `update`, `deleteById`, `delete`, `countDocuments`, `transaction`.

DALs extend these with custom queries — typically complex joins using Knex query builder and `sqlNestRelationships()` for nested entity mapping. All methods accept an optional `tx` parameter for transaction threading.

**Read replica pattern**: Read methods use `db.replicaNode()` (e.g., `(tx || db.replicaNode())(tableName)`), while writes always hit the primary (`(tx || db)(tableName)`). See any `ormify()` method in `src/lib/knex/index.ts` for the pattern.

`updateById` and `update` support atomic `$incr` and `$decr` operators alongside regular field updates.

**A dropped column does not fail type checking if the insert is built in a `.map()`.** TypeScript's
excess-property check only fires on a fresh object literal at the assignment site, so a stale field
survives when the literal is returned from a callback:

```ts
insertMany(names.map((name) => ({ name, role: "member", orgId })));  // compiles, then 500s at runtime
insertMany([{ name, role: "member", orgId }]);                       // TS2353
```

See `src/services/secret/secret-dal.ts` for a DAL that overrides the base `update` to auto-increment version and adds complex join queries.

### Service Module Structure

Services live in `src/services/` (100+ modules). Each typically contains:
- `*-dal.ts` — data access via `ormify()` + custom queries
- `*-service.ts` — business logic factory
- `*-types.ts` — DTOs and type definitions
- `*-queue.ts` — BullMQ async job handlers and/or cron-manager registrations (when needed)
- `*-fns.ts` — pure utility functions (when needed)

### Route Handler Pattern

Routes use Fastify's Zod type provider — schemas auto-generate OpenAPI docs. Each route specifies: `method`, `url`, `config.rateLimit` (using `readLimit` or `writeLimit` presets), `schema` (Zod schemas with `operationId` for OpenAPI), `onRequest: verifyAuth([AuthMode.*])`, and a `handler` that accesses business logic via `server.services.*`.

See `src/server/routes/v4/secret-router.ts` for a representative router file.

### Auth System

Auth extraction happens in `src/server/plugins/auth/`:
- `inject-identity.ts` — detects auth mode from request headers and attaches identity to request
- `verify-auth.ts` — middleware that checks if the request's auth mode is in the route's allowed strategies
- `inject-permission.ts` — attaches permission context
- `inject-assume-privilege.ts` — privilege escalation support
- `superAdmin.ts` — super admin flag injection

**Auth modes** (defined in `AuthMode` enum):
- **JWT** — user browser sessions (decoded from `Authorization: Bearer` header)
- **IDENTITY_ACCESS_TOKEN** — machine-to-machine identity tokens
- **SCIM_TOKEN** — SCIM provisioning tokens
- **OAUTH** — delegated user tokens from the `oauth-client` module. Same JWT shape and session binding as
  `JWT`, told apart by an `oauthClientId` claim. See [Delegated OAuth tokens](src/services/oauth-client/AGENTS.md).

**Deprecated auth modes (do not use in new code):**
- **API_KEY** — user API keys (from `x-api-key` header). Deprecated — use identity access tokens instead.
- **SERVICE_TOKEN** — service tokens (Bearer tokens starting with `st.` prefix). Deprecated — use identity access tokens instead.

If you encounter `API_KEY` or `SERVICE_TOKEN` in existing code, do not replicate them in new routes or services. All new machine authentication should use `IDENTITY_ACCESS_TOKEN`.

Token detection logic in `inject-identity.ts` checks `x-api-key` header first, then parses `Authorization: Bearer` and inspects JWT `authTokenType` field to determine mode.

**Delegated OAuth tokens** (`AuthMode.OAUTH`) are opt-in per route. Before listing it on a route, read [`src/services/oauth-client/AGENTS.md`](src/services/oauth-client/AGENTS.md): administration writes must not accept it (read-only administration routes may, with the credential-read exceptions listed there), and the handler must check a CASL ability, because that check is what applies the token's scopes.

### Resolving Users From Provisioning Identifiers

Every invite / removal path resolves a person by `users.username` (which always equals their email), never by `users.email` and never by a join. Provisioning identifiers and profile sync from the IdP go through `src/services/user-alias/`. Read [`src/services/user-alias/AGENTS.md`](src/services/user-alias/AGENTS.md) before changing SCIM, invite, removal, or SSO login paths.

### Permission System (CASL)

Uses CASL (`@casl/ability`) with MongoDB-style rules. Permission logic lives in `src/ee/services/permission/`:
- `permission-service.ts` — factory that builds CASL abilities from user/identity roles
- `project-permission.ts` — defines project-level permission actions and subjects
- `org-permission.ts` — defines org-level permission actions and subjects

Read [`src/ee/services/permission/AGENTS.md`](src/ee/services/permission/AGENTS.md) before adding a permission subject or action, or changing how a route checks or caches permissions.

### Request-Scoped Memoization

A per-request in-memory cache that eliminates redundant DB reads within a single HTTP request. Defined in `src/lib/request-context/request-memoizer.ts`, attached to Fastify's `@fastify/request-context` as the `memoizer` field (initialized in `src/server/app.ts`). Cache is automatically garbage-collected when the request ends — zero staleness risk, zero infrastructure.

**How it works**: `RequestMemoizer` wraps a `Map<string, unknown>` with an async `getOrSet(key, fetcher)` method. Concurrent calls for the same key coalesce onto a single fetcher invocation (in-flight deduplication). The `requestMemoize(key, fetcher)` helper reads the memoizer from request context and falls back to direct execution when no context exists (e.g. queue workers).

**Currently memoized**:
- `getProjectPermission` — full-function result (keyed by projectId + actor + actorId + actorOrgId + actorAuthMethod + actionProjectType). Eliminates redundant permission checks in batch secret operations (50 secrets → 1 DB round-trip instead of 50).
- `getOrgPermission` — full-function result (keyed by orgId + actor + actorId + actorOrgId + actorAuthMethod + scope).
- `projectDAL.findById` — in permission-service.ts and project-bot-fns.ts. Deduplicates 4 of the 5 redundant project lookups seen per secret read request.
- `userDAL.findById` / `identityDAL.findById` — in permission-service.ts. Eliminates the redundant actor lookup during permission resolution.

**Usage pattern**:
```ts
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

// In a service or function called during request handling:
const project = await requestMemoize(
  `project:findById:${projectId}`,
  () => projectDAL.findById(projectId)
);
```

**When to add more items to request-scoped memoization**:
- The data is **read-only within the request** — no mutations to the same record happen between reads.
- The same DAL call (same table, same ID) is made **2+ times in the same request** across different services or functions. Check with Datadog traces or by searching for the DAL method across call sites in the hot path.
- The call does **NOT use a DB transaction** (`trx` parameter). Transactional reads may see different data than read-replica results; memoizing them could return stale data.
- The call is on a **hot path** (auth, permissions, secret CRUD). Low-frequency admin endpoints don't benefit enough to justify the added indirection.

**When NOT to use**:
- Inside DB transactions — pass `trx` directly, skip memoization.
- For data mutated within the request and re-read (e.g. KMS key creation writes to the project row, then re-reads it).
- In queue workers or background jobs — the helper falls back gracefully, but there's no request lifecycle to scope the cache.
- For write operations — only memoize reads.

**Key format convention**: `<entity>:<method>:<id>` for DAL calls (e.g. `project:findById:${projectId}`), `permission:<scope>:<id>:...` for permission results.

### Queue System (BullMQ)

Queue infrastructure in `src/queue/queue-service.ts`. Defines 30+ named queues via `QueueName` enum (e.g., `SecretRotation`, `AuditLog`, `IntegrationSync`, `SecretReplication`, `SecretSync`, `DynamicSecretRevocation`). Each queue has typed payloads defined in `TQueueJobTypes`.

Queue jobs support: delays, attempts with exponential/fixed backoff, and completion/failure cleanup. **Use BullMQ only for event-driven, payload-carrying work** — jobs enqueued in response to a request or another job (audit log writes, integration syncs, secret replication, webhook fan-out, etc.).

**Do NOT use BullMQ repeatable jobs or `JobScheduler` for recurring/cron-pattern work.** All scheduled/periodic tasks must use the cron manager (see Scheduled Jobs below). The previous BullMQ-repeatable pattern has been migrated off, and `queueServiceFactory` actively cleans up stale repeatable queues and schedulers on boot (`src/queue/queue-service.ts:585-650`) — re-introducing a BullMQ repeatable will collide with that cleanup and cause double execution.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

`queueService.start(name, handler, opts)` accepts `concurrency` (per-worker parallelism ceiling) and BullMQ's `limiter: { max, duration }` (fleet-wide throughput cap, coordinated via Redis). Use both to **rate-shape DB-heavy background work** so a large backlog drains as an even plateau instead of a burst — see `src/services/project/project-cleanup-queue.ts`. The cron cadence must not be the pacer; load is bounded by `concurrency × per-job cost`, and the limiter caps steady throughput.

**`INFISICAL_RUN_MODES` gates the consumer, never the producer.** `start()` creates the BullMQ `Queue` for every queue in every run mode, and only skips creating the `Worker` when the queue isn't consumed by this pod: `secret-scanning` covers `SECRET_SCANNING_QUEUES`, `general-workers` covers everything else. This invariant is what makes splitting the fleet safe — an API-only pod runs no workers at all but must still be able to enqueue, since `queue()` silently no-ops on an uninitialized queue (`await q?.add(...)`) and would otherwise drop every job destined for another pod's worker. It also means `upsertJobScheduler` works from any pod, so boot-time scheduling needs no run-mode branch.

`QUEUE_WORKERS_ENABLED` and `QUEUE_WORKER_PROFILE` were replaced by `INFISICAL_RUN_MODES` and no longer exist.

**Worker heartbeats detect a fleet nobody deployed**, since an ungated producer means an `api`-only deployment silently queues work nothing consumes. In `src/lib/worker-heartbeat/worker-heartbeat.ts`: a `general-workers` pod `startReporting`s itself into a per-worker-type sorted set scored by its heartbeat deadline (60s beat, 5-minute TTL), and an `api` pod that doesn't run the fleet `startMonitoring`s it, logging an error while no instance reports. Observation only — never wire it into `/api/status`; a deployment missing its workers must still serve API traffic.

### Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager (`src/lib/cron/cron-job.ts`). Per-process refreshes use `startLocalRefresh` (`src/lib/cron/local-refresh.ts`), never the cron manager and never a raw `new CronJob`. Read [`src/lib/cron/AGENTS.md`](src/lib/cron/AGENTS.md) before adding or changing a scheduled job.

### Alerting (shared module — reuse it, don't fork it)

All user-facing "notify me when X happens" features share one module: `src/services/alert/`. It owns the alert CRUD, the channel stack (email, Slack, webhook, PagerDuty), recipients, dedup, history, and dispatch. To alert on a new resource, register an `IResourceAlertProvider` on the shared registry — do not stand up a per-domain alert service, channel table, or notification cron. Read [`src/services/alert/AGENTS.md`](src/services/alert/AGENTS.md) for the provider contract and invariants.

**If you touch a code path that deletes or detaches an alertable resource, it must reap that resource's alerts.** `alerts.resourceId` has no foreign key, so nothing cascades and the alert is left dangling. Use `alertService.deleteAlertsForDeletedResource` when the row is gone (unscoped, reaps across every org) and `deleteAlertsForResource` when the resource only left a scope.

### Approvals

All "someone has to approve this before it happens" features share one module:
`src/services/approval-policy/`, which owns policies, requests, steps, grants, break-glass, and
the generic `/v1/<policy-type>/approval-policies` endpoints. Current types: PAM access, certificate
requests, code signing.

A policy type plugs in through **one** extension point, a `TApprovalResource` (see its doc comment),
constructed with its own dependencies and registered in the `approvalResources` map in
`server/routes/index.ts`; that also gives it the generic `/v1/approval-policies/<type>/...` endpoints,
which every type now uses for policy CRUD, requests, approve, reject and grant revocation. **Do not stand up a per-product approval service, request table, or review
endpoint**: `access-approval-*` and `secret-approval-*` predate this module and are what we are
converging away from. A product-facing service on top of it (PAM's `pam-access-request-service.ts`) is
for product vocabulary only: resolving the resource a request names, notifications, and read models.
Any rule about what is *allowed* belongs in the resource, or the product's own API and the shared API
stop agreeing.

### Event Outbox

`src/services/event-outbox/` writes "this happened" as a row inside the caller's own transaction, so an event is exactly as durable as the business write. Anything that needs at-least-once delivery of a domain event registers a consumer there instead of enqueueing to Redis after commit. Read [`src/services/event-outbox/AGENTS.md`](src/services/event-outbox/AGENTS.md) before adding an event or a consumer.

### Soft-Delete + Async Cleanup

Resources whose deletion cascades across many/large tables use a **soft-delete + paced async hard-delete** pattern instead of a synchronous cascade in the request path.

Pattern:
- **Soft-delete columns** on the table: `deleteAfter`, `softDeletedAt`, `deletedByActorType`, `deletedByActorId`, plus a **partial index** `WHERE deleteAfter IS NOT NULL` (tiny, ~zero write cost on the live path). The DELETE handler sets `deleteAfter` (one UPDATE) and returns immediately. Set `deleteAfter = now()` for "real delete" UX (reaped on the next worker tick) or `now + grace` for a restore window. The actor pair follows the same `(actorType, actorId)` pattern used by audit logs — extensible to any `ActorType` without schema changes.
- **Hide soft-deleted rows from every read.** Override the `ormify` base `findById`/`findOne`/`find` to append `.whereNull("deleteAfter")`, and add explicit `*IncludingExpired` escape hatches used only by the cleanup worker/restore. Patch all custom read queries too — **especially any count feeding a plan/quota limit** (e.g. `countOfOrgProjects`), or soft-deleted rows wrongly count against limits. Free unique columns (e.g. the project slug) on soft-delete so the resource can be recreated immediately.
- **`Environment.deleteAfter` ≠ `Project.deleteAfter` — filter both.** The two soft-deletes are independent: soft-deleting a project does NOT soft-delete its environments. Many DALs already filter `Environment.deleteAfter` (from the env soft-delete) — that does **not** exclude a soft-deleted *project*'s data. So any **cron / cross-project enumeration** must also filter `Project.deleteAfter`: the rotation/sync/reminder queue queries, and cross-project listings (project/identity memberships, group projects, org product stats). External side effects are the dangerous case — without it, a soft-deleted project's secrets get rotated, synced, or reminded on during the cleanup window. Per-project reads resolved through `projectDAL.findById` are protected upstream (it returns nothing for a soft-deleted project).
- **Cron discovery + paced worker** (cron fans out to BullMQ): the cron selects the oldest `LIMIT N` expired rows (`ORDER BY deleteAfter ASC`) and enqueues one job each with a deterministic `jobId` (dedupe → queue stays bounded at ~N; never enqueue the whole backlog). The worker (`concurrency` + `limiter`) does the actual delete, re-reading via the **primary** under a per-resource lock to defeat replica-lag/restore races.
- **Chunk-deleting child rows: check inbound FKs first.** Reference implementation: `services/secret-v2-bridge/secret-tree-hard-delete-fns.ts` (project/env hard-delete workers).
  - `CASCADE` / `SET NULL` inbound FKs → safe to chunk.
  - `DEFERRABLE NO ACTION` → only if you delete the referencing rows in the **same transaction**; hard-delete paths only (never live deletes).
  - Non-deferrable `NO ACTION` / `RESTRICT` → neither path is safe: it breaks the final cascade too (next bullet). Migrate the FK to `DEFERRABLE INITIALLY DEFERRED` first.
  - Each batch: own transaction + `SET LOCAL statement_timeout`.
- **A non-deferrable `NO ACTION`/`RESTRICT` inbound FK is unsafe under cascading deletes; make it `DEFERRABLE INITIALLY DEFERRED`.** It is checked at end of *statement*, so within one cascading `DELETE` a parent branch can be processed before a sibling branch deletes the referencer, raising "update or delete on X violates FK on Y". When a CASCADE child of the deleted root is itself referenced by `NO ACTION`/`RESTRICT` FKs, declare those FKs `.deferrable("deferred")` so the check runs at COMMIT after the cascade completes (a *direct* parent delete is still blocked while a referencer remains). Audit **all** inbound `NO ACTION`/`RESTRICT` FKs of such a parent, not just one.
- **Index every FK referencing column that participates in a cascade.** Postgres does **not** auto-index FK columns. A cascade fires a **per-row** RI trigger on each child, so an unindexed child means one seq-scan *per deleted parent row*, which blows past `statement_timeout` on a chunked delete. Before chunk-deleting a large table, enumerate **every** inbound FK, including helper-generated ones: `createJunctionTable` (`src/db/utils.ts`) creates CASCADE FK columns with **no index** on either side, so every junction table needs explicit FK indexes. For a mostly-NULL nullable FK, a partial index `WHERE col IS NOT NULL` serves the cascade lookup at a fraction of the size/write cost.
- **Observe the backlog, not just the queue.** Queue depth caps at the discovery batch size, so it can't reveal the true backlog. Record the discovery result from the cron tick itself (e.g. `infisical.project_cleanup.discovered` / `infisical.project_env_cleanup.discovered` on the `InfisicalCore` meter: last batch size, capped at the discovery LIMIT). **Alert when the gauge stays at the cap** — it means the drain rate can't keep up (raise concurrency/limiter) or a mass-delete is in progress.

### Error Handling

Custom error classes in `src/lib/errors/index.ts`:
- `BadRequestError` (400) — with optional `details` field
- `UnauthorizedError` (401)
- `ForbiddenRequestError` (403) — with optional `details`
- `PermissionBoundaryError` — extends `ForbiddenRequestError`
- `NotFoundError` (404)
- `DatabaseError` (500) — wraps original Knex error
- `GatewayTimeoutError` (504)
- `InternalServerError` (500)
- `RateLimitError`
- `ScimRequestError` — SCIM-specific formatting with schemas and status
- `ClientClosedRequestError` (499, nginx convention) — the client disconnected before the response was written; see below

Global error handler in `src/server/plugins/error-handler.ts` maps these to HTTP status codes and records OpenTelemetry error metrics.

#### Stopping work after a client disconnect

Node keeps running a handler after its client has gone, and a disconnected client usually retries, so a CPU-heavy request that outlives its caller does the full cost again on another pod. Routes whose work can run long after the database reads finish (fan-out over folders, references, or imports) should stop when the connection closes. `GET /api/v3/secrets/raw` and `GET /api/v4/secrets` are examples.

- **Route:** pass `abortSignal: getClientDisconnectSignal(reply)` (`src/server/lib/client-disconnect.ts`) into the service. It aborts only when the socket closes before the response was written, so a normal completion never trips it.
- **Service:** call `throwIfClientDisconnected(abortSignal)` at fan-out points only: before each unit of work that triggers more reads (each reference, each import level, a shared folder load). Don't add one after every `await`; a check that saves a single query for a client that has already left is noise. Checks are cooperative, so an in-flight query or synchronous block still finishes, and a long synchronous block delays noticing the disconnect. Keep the per-item work linear.
- **`Promise.allSettled` fan-outs:** they swallow the rejection, so scan the results with `throwIfAnySettledClientClosed(results)` instead of rechecking the signal. A disconnect mid-fan-out means the result is partial and must not be cached or returned as reference errors; a result that completed before the client left should still be cached so the retry is a hit.
- **Catch blocks** that turn failures into an empty result (a folder that failed to load, a skipped cross-project read) must rethrow `ClientClosedRequestError` first, or the partial state gets cached.

The 499 never reaches the caller. It exists for logs (warn, no stack) and the `error.type="client_closed"` label on `infisical.core.http.error.count`. This is disconnect handling, not a request deadline: a slow client that stays connected is still bounded only by Fastify's 100s socket `connectionTimeout` in `src/server/app.ts`.

### Logging

Uses Pino via `@app/lib/logger`. Always include key identifiers in the message string using `[key=value]` format for log searchability. You may also pass a structured object as the first argument for programmatic access, but the message must be self-contained:

```ts
// Preferred: identifiers in message + structured object
logger.error({ sessionId, err }, `Failed to get connection details [sessionId=${sessionId}]`);

// Also acceptable: identifiers in message only
logger.info(`getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`);

// NOT preferred: identifiers only in structured object, not in message
logger.error({ sessionId, err }, "Failed to get connection details");
```

**Never log an outbound URL verbatim — a URL is often itself a credential.** Incoming-webhook providers put the bearer secret in the path (`https://hooks.slack.com/services/T…/B…/<secret>`, Discord, Teams, Telegram) and many APIs accept a token as a query param, so a raw URL in a log line ships a working credential to the log sink. Pass it through `sanitizeUrlForLog` from `@app/lib/logger` first (`src/lib/logger/sanitize-url.ts`): it keeps only the origin, strips userinfo and the fragment, redacts the entire path, and redacts every query value. Token formats can't be recognised reliably, so the path is redacted by default for every host rather than sniffed with heuristics. The global axios response interceptor (`src/lib/config/request.ts`) and `safeRequest`'s dispatch log already do this.

Note that `logger.ts` also has a `redactedKeys` list applied to structured-object fields up to depth three. It only matches by key name, so it does **not** help with a secret embedded in a `url` field.

### Internal CAs: revocation and key sources

CRL (`ee/services/certificate-authority-crl`), OCSP (`ee/services/certificate-authority-ocsp`), and internal CA signing keys held outside Infisical (`services/certificate-authority/ca-key-source/`) are covered in [`src/services/certificate-authority/AGENTS.md`](src/services/certificate-authority/AGENTS.md).

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:
- `src/ee/services/` — 60+ service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/` — 63 EE route files; `src/ee/routes/v2/` — 10 v2 route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/AGENTS.md`](src/ee/services/pam/AGENTS.md) for a high-level map of the PAM backend — module layout, permission model, and non-obvious invariants. It is intentionally a concept map, not a spec: read the referenced code for implementation detail. If you add a feature, keep any addition there brief (a concept or invariant, not code mechanics).

**Agent Vault**: the same applies to the `agent-vault-*` services and routers; the concept map is [`src/ee/services/agent-vault/AGENTS.md`](src/ee/services/agent-vault/AGENTS.md). PAM and Agent Vault are the two **org-scoped products**: one implicit project per org, resolved lazily, whose roles collapse to admin or member. Anything that branches on `ProjectType.PAM` (metering emits, predefined roles, the billable-project count, invite grants) almost always needs an Agent Vault arm too.

**Secret Scanning** is single-project (see the root `AGENTS.md`): `secret-scanning-v2-project-bootstrap.ts` creates the project with the org when it has a creator to make admin (like PAM and Agent Vault), `secret-scanning-v2-project-resolver.ts` picks the active project and lazily creates it, with every org admin as project admin, for older orgs and for orgs created from the admin console, whose admins are only invited after the org exists, and routes that take `projectId` read `req.internalSecretScanningProjectId`. A data source covers the resources it has rows for (added by a user or discovered from a push); its `config` only says where to look (Bitbucket workspace, GitLab group), never which resources, so scans, "included" state and GitLab account-scope webhooks all key off rows. Stored configs may still carry the old `includeRepos` / `includeProjects` keys, which nothing reads.

**Dynamic secret lease secrets needed at revoke time go in `dynamic_secret_leases.encryptedLeaseData`**, never in `externalEntityId` or `config` (both plaintext, and `externalEntityId` is returned by every lease route and logged in audit events). A provider opts in by listing the `create()` `data` keys in `persistedLeaseFields`; the lease service encrypts them with the project's SecretManager key and every revoke path passes them back as `metadata.leaseData`. Lease routes return `SanitizedDynamicSecretLeaseSchema` so the column never reaches a response. Secret *config* fields are listed separately in `DYNAMIC_SECRET_SECRET_FIELDS` (`providers/redact.ts`), as dotted paths so nested secrets work (`clientAuth.clientSecret`): reads strip them via `redactStoredInputs`, and an update that omits one keeps the stored value via `restoreOmittedSecretFields`, because the update merge is shallow.

**Gateways: there is only one generation.** Gateway v1 (`ee/services/gateway`, `lib/gateway`, the QUIC
transport over `@infisical/quic`, and `/api/v1/gateways`) is gone; `gateway-v2` and `gateway-pool` are the
whole story, and `lib/gateway-v2/types.ts` owns `GatewayProxyProtocol` / `GatewayHttpProxyActions`. What
survives is DB-only, and deliberately: the `gateways`, `org_gateway_config` and `project_gateways` tables
and the `gatewayId` columns on `dynamic_secrets`, `identity_kubernetes_auths` and
`identity_auth_templates` are still populated but never read or written, so the removal stays revertible.
Those three tables' `TableName` members exist for that reason alone.

Two consequences when touching a gateway dial path. Resolve the gateway with
`gatewayV2Service.getPlatformConnectionDetailsByGatewayId`, and when it returns nothing **throw**
(`getMissingGatewayMessage` in `lib/gateway-v2/gateway-errors.ts`) rather than continuing: every one of
these call sites sits in front of an `if (gatewayId)` guard whose else-branch dials the target host
directly, so falling through turns a dangling gateway reference into a silent bypass of the network
boundary the gateway exists to enforce. And `app_connections.gatewayId` is **not** a v1 column — unlike the
three above it never grew a `gatewayV2Id`, so that one column carries v2 ids and must stay.

**Any new path that attaches an individual gateway must call `assertIndividualGatewayAllowed`**
(`ee/services/gateway-pool/gateway-pool-policy-fns.ts`) next to its `AttachGateways` check. It enforces the
org-level `requireGatewayPools` setting. Pass the gateway the resource already had as `previousGatewayId`,
because clients re-send unchanged values on every save and resources created before the setting was turned
on must stay editable. The check reads the setting, not the plan, so it keeps applying after a downgrade.
Only exempt a mode that refuses pools outright, the way gateway Kubernetes auth in Gateway review mode does
(`$assertCanAttachProxy` in `resource-auth-method-service.ts`), or the policy removes that mode entirely.

### Audit Logs

Audit logs live in **one** store at a time: ClickHouse when a client is configured and `CLICKHOUSE_AUDIT_LOG_ENABLED` is on, otherwise Postgres. Every reader has to pick the store the same way, or it goes silently empty. A new `EventType` is `management` unless you add it to an explicit class list. Read [`src/ee/services/audit-log/AGENTS.md`](src/ee/services/audit-log/AGENTS.md) before adding an event type or a reader.

### Server Plugins

Key plugins in `src/server/plugins/`:
- `error-handler.ts` — global error handling with OpenTelemetry metrics
- `fastify-zod.ts` — in-house Zod-to-OpenAPI transformation
- `audit-log.ts` — request audit logging to queue
- `api-metrics.ts` — OpenTelemetry metrics collection
- `inject-rate-limits.ts` — per-route rate limiting
- `secret-scanner.ts` / `secret-scanner-v2.ts` — secret scanning webhooks
- `serve-ui.ts` — frontend asset serving
- `swagger.ts` — Swagger/OpenAPI UI
- `maintenanceMode.ts` — maintenance mode middleware
- `ip.ts` — IP extraction and validation

### Telemetry / Metrics

OpenTelemetry metrics live in `src/lib/telemetry/`. New metrics use the `InfisicalCore` meter, whose attribute allowlist keeps only bounded labels. Read [`src/lib/telemetry/AGENTS.md`](src/lib/telemetry/AGENTS.md) before adding a metric or an attribute.

### PostHog Product Analytics

`src/services/telemetry/telemetry-service.ts` captures product events; high-volume events are buffered in Redis and rolled up by a cron. Read [`ANALYTICS.md`](../ANALYTICS.md) and [`src/services/telemetry/AGENTS.md`](src/services/telemetry/AGENTS.md) before adding an event or touching the buffer.

### Instance Root Encryption Key (rotation)

`ENCRYPTION_KEY` wraps the in-DB root key in `kms_root_config`, which wraps everything else, and it is rotatable. Read [`src/services/kms/AGENTS.md`](src/services/kms/AGENTS.md) before touching `kms_root_config` or root key handling.

### Database Configuration

Knex config in `src/db/knexfile.ts`. Loads `.env.migration` then `.env`. Supports `DB_CONNECTION_URI` or individual host/port/user/name/password fields. Optional SSL via `DB_ROOT_CERT` (base64-encoded CA cert). Connection pool: min 2, max 10. Migrations table: `infisical_migrations`. Separate audit log DB supported via `auditlog-migration:*` scripts. ClickHouse for analytics (optional).

Migrations in `src/db/migrations/`. Auto-generated Zod schemas in `src/db/schemas/`.

## Wiring a New Feature (Checklist)

1. Create service module in `src/services/<name>/` (or `src/ee/services/<name>/` for EE) with DAL, service, and types files
2. If adding DB tables: create migration via `npm run migration:new`, run it, then `npm run generate:schema`
3. Wire in `src/server/routes/index.ts`: instantiate DAL → instantiate service → add to `server.decorate("services", {...})`
4. Create router in `src/server/routes/v<N>/` (or `src/ee/routes/v<N>/` for EE) and register it
5. Review the whole change against [`CODE_QUALITY.md`](CODE_QUALITY.md)
6. Run `make reviewable-api` to verify lint + types
