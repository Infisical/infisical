# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

## Essential Commands

All commands run from the `backend/` directory:

- `npm run dev` — start dev server with tsx watch + pino-pretty logging
- `npm run build` — production build via tsup with sourcemaps
- `npm run lint:fix` — ESLint autofix
- `npm run type:check` — TypeScript check (uses 8GB heap)
- `make reviewable-api` (from repo root) — runs `lint:fix` + `type:check` (run before PRs)

### Testing

- `npm run test:unit` — unit tests matching `./src/**/*.test.ts`
- `npm run test:e2e` — e2e tests matching `./e2e-test/**/*.spec.ts` (single-threaded, requires running DB/Redis)
- `npm run test:e2e-watch` — e2e tests in watch mode

Unit tests go next to source as `*.test.ts` and test pure functions with Vitest globals (`describe`, `test`, `expect`).

E2E tests live in `e2e-test/routes/`. The custom Vitest environment (`e2e-test/vitest-environment-knex.ts`) bootstraps a full server with DB, Redis, and encryption. Tests use injected globals: `testServer` (Fastify instance), `jwtAuthToken` (pre-authenticated JWT). Use `testServer.inject()` for HTTP assertions. Test helpers in `e2e-test/testUtils/` provide CRUD wrappers for secrets, folders, and secret imports. See `e2e-test/routes/v1/org.spec.ts` for a representative e2e test.

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
- **MCP_JWT** — MCP-specific JWTs (has `.mcp` field in payload)

**Deprecated auth modes (do not use in new code):**
- **API_KEY** — user API keys (from `x-api-key` header). Deprecated — use identity access tokens instead.
- **SERVICE_TOKEN** — service tokens (Bearer tokens starting with `st.` prefix). Deprecated — use identity access tokens instead.

If you encounter `API_KEY` or `SERVICE_TOKEN` in existing code, do not replicate them in new routes or services. All new machine authentication should use `IDENTITY_ACCESS_TOKEN`.

Token detection logic in `inject-identity.ts` checks `x-api-key` header first, then parses `Authorization: Bearer` and inspects JWT `authTokenType` field to determine mode.

### Permission System (CASL)

Uses CASL (`@casl/ability`) with MongoDB-style rules. Permission logic lives in `src/ee/services/permission/`:
- `permission-service.ts` — factory that builds CASL abilities from user/identity roles
- `project-permission.ts` — defines project-level permission actions and subjects
- `org-permission.ts` — defines org-level permission actions and subjects

**Project permission actions** include standard CRUD plus specialized ones like `DescribeSecret` (see metadata without value), `ReadValue`, `GrantPrivileges`, `AssumePrivileges`, `Lease` (for dynamic secrets). See `ProjectPermissionActions`, `ProjectPermissionSecretActions`, `ProjectPermissionDynamicSecretActions`, and `ProjectPermissionIdentityActions` enums in `project-permission.ts`.

Built-in roles: `Admin`, `Member`, `Viewer`, `NoAccess`. Custom roles use unpacked CASL rules stored in the database. Rules can include conditions with operators `$IN`, `$EQ`, `$NEQ`, `$GLOB` (for pattern matching like `prod-*`). See `PermissionConditionSchema` in `permission-types.ts`.

**Project permission caching** uses a fingerprint-based two-tier cache (`withCacheFingerprint` in `src/lib/cache/with-cache.ts`):
- **Short-lived marker** (10s TTL) in Redis — while present, cached data is served with 0 DB reads.
- **Long-lived data payload** (10m TTL) in Redis — holds the full permission blob plus a fingerprint hash.
- On marker expiry, a lightweight **fingerprint query** (`getPermissionFingerprint` in `permission-dal.ts`) runs (1 DB read). If the fingerprint matches the cached payload, the marker is reset; otherwise, a full data re-fetch occurs.
- The fingerprint covers **both project-scoped and org-scoped** memberships for the actor, so org-level changes (e.g. SSO bypass grant/revoke, org role edits) also trigger cache invalidation.
- `filterTemporary` in `flattenActiveRolesFromMemberships` runs on every request as a real-time safety net — it filters out expired temporary access regardless of cache state, so access revocation for timed roles/privileges is immediate.
- **No explicit cache invalidation calls exist.** The fingerprint self-corrects within the marker TTL (10s eventual consistency for access granting). The old `invalidateProjectPermissionCache` / DAL version counter pattern has been removed.
- Cache helpers (`cacheGet`, `cacheSet`, `applyReviver`) in `src/lib/cache/with-cache.ts` are shared between the simple `withCache` and the fingerprint-based `withCacheFingerprint`.

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

**Do NOT use BullMQ repeatable jobs or `JobScheduler` for recurring/cron-pattern work.** All scheduled/periodic tasks must use the cron manager (see below). The previous BullMQ-repeatable pattern has been migrated off, and `queueServiceFactory` actively cleans up stale repeatable queues and schedulers on boot (`src/queue/queue-service.ts:585-650`) — re-introducing a BullMQ repeatable will collide with that cleanup and cause double execution.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

`queueService.start(name, handler, opts)` accepts `concurrency` (per-worker parallelism ceiling) and BullMQ's `limiter: { max, duration }` (fleet-wide throughput cap, coordinated via Redis). Use both to **rate-shape DB-heavy background work** so a large backlog drains as an even plateau instead of a burst — see `src/services/project/project-cleanup-queue.ts`. The cron cadence must not be the pacer; load is bounded by `concurrency × per-job cost`, and the limiter caps steady throughput.

### Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager in `src/lib/cron/cron-job.ts` (`cronJobFactory`). A single instance is constructed in `src/server/routes/index.ts` (~line 541) and injected as `cronJob` into any service that needs to schedule periodic work. The factory exposes `register`, `start`, and `stop`; `start` is called once after construction, and `stop` is invoked during graceful shutdown to drain in-flight handlers.

**Why this exists instead of BullMQ repeatables**: cron runs are coordinated across pods via a slot-election scheme (5 participant slots backed by Redis SET NX/PX) plus per-run redlocks, so each fire executes exactly once across the fleet without the orphaned-scheduler / duplicate-execution failure modes the BullMQ `JobScheduler` had. The manager also handles crash recovery via lease TTLs, hang recovery via per-handler timeouts, and bounded exponential backoff that won't overlap with the next scheduled fire.

**Registering a cron job**:

1. Add a new entry to the `CronJobName` registry at the top of `src/lib/cron/cron-job.ts`. All cron names must be defined there — don't pass raw strings.
2. In the owning service/queue file, take `cronJob: TCronJobFactory` as a dependency and call `cronJob.register(...)` from an `init()` (or `start*()`) method:

   ```ts
   import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";

   export const myServiceFactory = ({ cronJob }: { cronJob: TCronJobFactory }) => {
     const init = () => {
       cronJob.register({
         name: CronJobName.MyJob,
         pattern: "*/5 * * * *",      // standard cron, UTC
         runHashTtlS: 60 * 60,        // how long the run hash lives in Redis
         enabled: !appCfg.isSecondaryInstance, // gate per-deploy if needed
         maxAttempts: 3,              // optional, default 3
         handler: async () => { /* work */ }
       });
     };
     return { init };
   };
   ```

3. Add a corresponding alarm in the infrastructure repo so the new job is monitored. Follow the existing pattern in `infisical-shared-cloud/modules/redis_alarms/main.tf` — every cron job must have an alarm defined there. Don't ship a new cron job without wiring up its alarm.

**Handler contract**:
- Each scheduled fire runs exactly once across the fleet: pods race for a per-run redlock, the winner executes the handler, and the others no-op. You don't need in-handler locking to guard against concurrent pods.
- Handlers must be idempotent at the boundary of `handlerTimeoutMs` (default 5 min). A timeout marks the run failed-final and waits for the next fire — it does NOT retry the same fire, because the timed-out handler may still be running.
- Failures (non-timeout) retry with exponential backoff (base 30 s, max 5 min) up to `maxAttempts`, but only if the retry would still fit before the next scheduled fire. Otherwise the next fire is treated as the natural retry.
- Long-running handlers should override `handlerTimeoutMs` / `leaseDurationMs` per-entry (must satisfy `handlerTimeoutMs <= leaseDurationMs`).

**When to use cron vs. queue**:
- Scheduled/recurring (every N minutes, daily at X, cron pattern) → `cronJob.register(...)`.
- One-shot or event-triggered work (enqueued from a request handler or another job) → BullMQ queue + worker.
- A cron handler that fans out per-tenant work typically *enqueues BullMQ jobs* for each unit of work rather than doing the work inline — keep the cron tick fast and let the queue worker handle parallelism and retries for the actual payload.

See `src/services/health-alert/health-alert-queue.ts` for a minimal example, `src/services/resource-cleanup/resource-cleanup-queue.ts` for a service with multiple registrations, and `src/ee/services/secret-rotation-v2/secret-rotation-v2-queue.ts` for a cron-tick that fans out into a BullMQ queue.

### Soft-Delete + Async Cleanup

Resources whose deletion cascades across many/large tables use a **soft-delete + paced async hard-delete** pattern instead of a synchronous cascade in the request path.

Pattern:
- **Soft-delete columns** on the table: `deleteAfter`, `softDeletedAt`, `deletedByActorType`, `deletedByActorId`, plus a **partial index** `WHERE deleteAfter IS NOT NULL` (tiny, ~zero write cost on the live path). The DELETE handler sets `deleteAfter` (one UPDATE) and returns immediately. Set `deleteAfter = now()` for "real delete" UX (reaped on the next worker tick) or `now + grace` for a restore window. The actor pair follows the same `(actorType, actorId)` pattern used by audit logs — extensible to any `ActorType` without schema changes.
- **Hide soft-deleted rows from every read.** Override the `ormify` base `findById`/`findOne`/`find` to append `.whereNull("deleteAfter")`, and add explicit `*IncludingExpired` escape hatches used only by the cleanup worker/restore. Patch all custom read queries too — **especially any count feeding a plan/quota limit** (e.g. `countOfOrgProjects`), or soft-deleted rows wrongly count against limits. Free unique columns (e.g. the project slug) on soft-delete so the resource can be recreated immediately.
- **`Environment.deleteAfter` ≠ `Project.deleteAfter` — filter both.** The two soft-deletes are independent: soft-deleting a project does NOT soft-delete its environments. Many DALs already filter `Environment.deleteAfter` (from the env soft-delete) — that does **not** exclude a soft-deleted *project*'s data. So any **cron / cross-project enumeration** must also filter `Project.deleteAfter`: the rotation/sync/reminder queue queries, and cross-project listings (project/identity memberships, group projects, org product stats). External side effects are the dangerous case — without it, a soft-deleted project's secrets get rotated, synced, or reminded on during the cleanup window. Per-project reads resolved through `projectDAL.findById` are protected upstream (it returns nothing for a soft-deleted project).
- **Cron discovery + paced worker** (cron fans out to BullMQ): the cron selects the oldest `LIMIT N` expired rows (`ORDER BY deleteAfter ASC`) and enqueues one job each with a deterministic `jobId` (dedupe → queue stays bounded at ~N; never enqueue the whole backlog). The worker (`concurrency` + `limiter`) does the actual delete, re-reading via the **primary** under a per-resource lock to defeat replica-lag/restore races.
- **Only manually chunk-delete a table whose inbound FKs are all `CASCADE`/`SET NULL`.** A table with a `DEFERRABLE NO ACTION` inbound FK (e.g. `secret_rotation_v2_secret_mappings.secretId → secrets_v2`) must be left to the final `deleteById` cascade, which resolves the deferred check at COMMIT across the whole tree; deleting its parent outside that tree fails the check. Use `SET LOCAL statement_timeout` per batch so the bound can't leak to pooled connections. (Example: `secret_versions_v2` is chunked by `folderId` because all its inbound FKs are CASCADE/SET NULL and it has no `folderId`/`secretId` FK back to the project, so the project cascade would otherwise orphan it.)
- **A non-deferrable `NO ACTION`/`RESTRICT` inbound FK is unsafe under cascading deletes; make it `DEFERRABLE INITIALLY DEFERRED`.** It is checked at end of *statement*, so within one cascading `DELETE` a parent branch can be processed before a sibling branch deletes the referencer, raising "update or delete on X violates FK on Y". When a CASCADE child of the deleted root is itself referenced by `NO ACTION`/`RESTRICT` FKs, declare those FKs `.deferrable("deferred")` so the check runs at COMMIT after the cascade completes (a *direct* parent delete is still blocked while a referencer remains). Audit **all** inbound `NO ACTION`/`RESTRICT` FKs of such a parent, not just one.
- **Index every FK referencing column that participates in a cascade.** Postgres does **not** auto-index FK columns. A cascade fires a **per-row** RI trigger on each child, so an unindexed child means one seq-scan *per deleted parent row*, which blows past `statement_timeout` on a chunked delete. Before chunk-deleting a large table, enumerate **every** inbound FK, including helper-generated ones: `createJunctionTable` (`src/db/utils.ts`) creates CASCADE FK columns with **no index** on either side, so every junction table needs explicit FK indexes. For a mostly-NULL nullable FK, a partial index `WHERE col IS NOT NULL` serves the cascade lookup at a fraction of the size/write cost.
- **Observe the backlog, not just the queue.** Queue depth caps at the discovery batch size, so it can't reveal the true backlog. Emit a DB-count observable gauge of pending rows (`infisical.project_cleanup.pending` on the `InfisicalCore` meter) and **alert on sustained growth** — it means the drain rate can't keep up (raise concurrency/limiter) or a mass-delete is in progress.

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

Global error handler in `src/server/plugins/error-handler.ts` maps these to HTTP status codes and records OpenTelemetry error metrics.

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

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:
- `src/ee/services/` — 60+ service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/` — 63 EE route files; `src/ee/routes/v2/` — 10 v2 route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/CLAUDE.md`](src/ee/services/pam/CLAUDE.md). It documents the permission model, shared helpers, account type checklist, and session lifecycle. Any new PAM core logic or helpers must be documented there.

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

OpenTelemetry metric setup lives in `src/lib/telemetry/`. Instruments are defined in `metrics.ts` (resolved lazily so they bind to the real MeterProvider installed by `instrumentation.ts` after boot).

**Meter split by cardinality:**
- **`InfisicalCore`** — the meter for all new metrics. A strict attribute allowlist (`INFISICAL_CORE_METER_ATTRIBUTES` in `telemetry-attributes.ts`) is applied via an SDK View, so **only bounded labels survive** — HTTP method, parameterized `http.route` template, and low-cardinality enums. This is the single choke point: any attribute passed at a call site that isn't in the allowlist is silently dropped.
- **Legacy `Infisical` / `API` / `SecretSyncs` / `PkiSyncs` / `Integrations`** — have no View and carry unbounded per-actor labels. Dropped wholesale via `OTEL_DROP_HIGH_CARDINALITY_METERS=true` in multi-tenant/cloud.

**Rules for InfisicalCore metrics:**
- **No per-tenant / per-actor identifiers** as labels — no org id, user id/email, identity id, ip, user agent, request id, or free-form values (e.g. environment slug). These scale series count with customer count, which breaks CloudWatch's 1000-datapoint-per-OTLP-request limit and drives per-GB ingestion cost. Use the **audit log table** for per-org / per-actor breakdowns.
- Adding a new label means adding it to the allowlist in `telemetry-attributes.ts`. Only add **bounded** keys (fixed enums / static route templates), and document why.
- `http.route` must be the parameterized template (`req.routeOptions.url`), never the raw request path.

### Database Configuration

Knex config in `src/db/knexfile.ts`. Loads `.env.migration` then `.env`. Supports `DB_CONNECTION_URI` or individual host/port/user/name/password fields. Optional SSL via `DB_ROOT_CERT` (base64-encoded CA cert). Connection pool: min 2, max 10. Migrations table: `infisical_migrations`. Separate audit log DB supported via `auditlog-migration:*` scripts. ClickHouse for analytics (optional).

Migrations in `src/db/migrations/`. Auto-generated Zod schemas in `src/db/schemas/`.

## Wiring a New Feature (Checklist)

1. Create service module in `src/services/<name>/` (or `src/ee/services/<name>/` for EE) with DAL, service, and types files
2. If adding DB tables: create migration via `npm run migration:new`, run it, then `npm run generate:schema`
3. Wire in `src/server/routes/index.ts`: instantiate DAL → instantiate service → add to `server.decorate("services", {...})`
4. Create router in `src/server/routes/v<N>/` (or `src/ee/routes/v<N>/` for EE) and register it
5. Run `make reviewable-api` to verify lint + types
