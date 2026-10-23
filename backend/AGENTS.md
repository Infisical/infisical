# Backend

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

**Read [`CODE_QUALITY.md`](CODE_QUALITY.md) before any change in this package, and check the change against it, whatever the change is, before calling the task done.** This file covers *where* code goes and *which* pattern to follow; the quality guide covers the minimum any implementation has to handle. It is a deliberately non-exhaustive floor, so the topics it happens to cover are not a filter for whether it applies.

Some of it needs judgment rather than a mechanical check. The deadlock rules cannot be caught by testing one request at a time. And a design that breaks REST should be raised with the author, with the conforming alternative proposed, rather than implemented silently or quietly "fixed" (some deviations are deliberate).

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

Run `make test-api-unit` and `make test-api-e2e` (narrow with `SPEC=<pattern>`) from the repo root, the same entry point CI uses. **Never point `npm run test:e2e` at the dev database**: the Vitest environment runs `DROP SCHEMA public CASCADE` on whatever `.env.test` targets. Unit tests go next to source as `*.test.ts`. Never add test-only code to `src/`. Read [`e2e-test/AGENTS.md`](e2e-test/AGENTS.md) before writing or running tests, or editing `Dockerfile.fips-toolchain` or `Dockerfile.dev.fips`; it covers `testUtils`, faking third-party providers, and the FIPS test image.

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

## Self-Hosting and Dependencies

Infisical supports self-hosted deployment via Docker. Key considerations:
- **`Dockerfile.standalone-infisical`** — single-container image with both frontend and backend; used for simple deployments.
- **`Dockerfile.fips.standalone-infisical`** — FIPS 140-2 compliant variant for regulated environments. Be strict about not introducing dependencies that break FIPS compliance.
- **`docker-compose.prod.yml`** — production compose with backend, PostgreSQL, and Redis.
- New backend dependencies should be evaluated carefully — they affect container size, FIPS compliance, and the encryption boundary. Check `docs/` for self-hosted deployment documentation when in doubt.

The backend installs with the npm bundled in Node 26 (11.x), which skips dependency install scripts unless `allowScripts` in `backend/package.json` approves them. The install still succeeds when a script is skipped, so a native addon that was not approved fails only when it is first `require`d. When adding or bumping a dependency with an install script, run `npm install-scripts ls` and approve or deny what it lists (`npm install-scripts approve <pkg>`).

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

Auth modes are detected in `src/server/plugins/auth/` (`AuthMode`: JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN, OAUTH). **`API_KEY` and `SERVICE_TOKEN` are deprecated: never use them in new routes or services**; new machine authentication uses `IDENTITY_ACCESS_TOKEN`. Read [`src/server/plugins/auth/AGENTS.md`](src/server/plugins/auth/AGENTS.md) before changing how a route authenticates.

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

`requestMemoize(key, fetcher)` (`src/lib/request-context/`) dedupes repeated read-only DAL calls within one request. Never memoize a transactional read or a record the request mutates. Read [`src/lib/request-context/AGENTS.md`](src/lib/request-context/AGENTS.md) before adding a memoized call.

### Queue System (BullMQ)

Use BullMQ only for event-driven, payload-carrying work. **Never use repeatable jobs or `JobScheduler` for recurring work**; that goes through the cron manager. `INFISICAL_RUN_MODES` gates the consumer, never the producer. Read [`src/queue/AGENTS.md`](src/queue/AGENTS.md) before adding a queue or changing its concurrency or rate limit.

### Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager (`src/lib/cron/cron-job.ts`). Per-process refreshes use `startLocalRefresh` (`src/lib/cron/local-refresh.ts`), never the cron manager and never a raw `new CronJob`. Read [`src/lib/cron/AGENTS.md`](src/lib/cron/AGENTS.md) before adding or changing a scheduled job.

### Alerting (shared module — reuse it, don't fork it)

All user-facing "notify me when X happens" features share one module: `src/services/alert/`. It owns the alert CRUD, the channel stack (email, Slack, webhook, PagerDuty), recipients, dedup, history, and dispatch. To alert on a new resource, register an `IResourceAlertProvider` on the shared registry — do not stand up a per-domain alert service, channel table, or notification cron. Read [`src/services/alert/AGENTS.md`](src/services/alert/AGENTS.md) for the provider contract and invariants.

**If you touch a code path that deletes or detaches an alertable resource, it must reap that resource's alerts.** `alerts.resourceId` has no foreign key, so nothing cascades and the alert is left dangling. Use `alertService.deleteAlertsForDeletedResource` when the row is gone (unscoped, reaps across every org) and `deleteAlertsForResource` when the resource only left a scope.

### Approvals

All "someone has to approve this before it happens" features share `src/services/approval-policy/`, and a policy type plugs in through one `TApprovalResource`. **Do not stand up a per-product approval service, request table, or review endpoint.** Read [`src/services/approval-policy/AGENTS.md`](src/services/approval-policy/AGENTS.md) before adding a policy type or an approval rule.

### Event Outbox

`src/services/event-outbox/` writes "this happened" as a row inside the caller's own transaction, so an event is exactly as durable as the business write. Anything that needs at-least-once delivery of a domain event registers a consumer there instead of enqueueing to Redis after commit. Read [`src/services/event-outbox/AGENTS.md`](src/services/event-outbox/AGENTS.md) before adding an event or a consumer.

### Soft-Delete + Async Cleanup

Resources whose deletion cascades across large tables are soft-deleted and hard-deleted later by a paced worker. Hide soft-deleted rows from every read, and filter both `Environment.deleteAfter` and `Project.deleteAfter`, because the two are independent. Read [`src/services/resource-cleanup/AGENTS.md`](src/services/resource-cleanup/AGENTS.md) before adding a soft-delete, a cascading foreign key, or a hard-delete worker.

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
- `ClientClosedRequestError` (499, nginx convention) — the client disconnected before the response was written; see "Stopping work after a client disconnect"

Global error handler in `src/server/plugins/error-handler.ts` maps these to HTTP status codes and records OpenTelemetry error metrics.

#### Stopping work after a client disconnect

Long read fan-outs take `abortSignal: getClientDisconnectSignal(reply)` (`src/server/lib/client-disconnect.ts`) and stop when the client goes away, so a partial result is never cached. Read [`src/server/lib/AGENTS.md`](src/server/lib/AGENTS.md) before adding one.

### Logging

**Never log an outbound URL verbatim, because a URL is often itself a credential.** Include key identifiers in the message as `[key=value]`. Read [`src/lib/logger/AGENTS.md`](src/lib/logger/AGENTS.md) before adding or changing any log message.

### Internal CAs: revocation and key sources

CRL (`ee/services/certificate-authority-crl`), OCSP (`ee/services/certificate-authority-ocsp`), and internal CA signing keys held outside Infisical (`services/certificate-authority/ca-key-source/`) are covered in [`src/services/certificate-authority/AGENTS.md`](src/services/certificate-authority/AGENTS.md).

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:
- `src/ee/services/` — 60+ service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/` — 63 EE route files; `src/ee/routes/v2/` — 10 v2 route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/AGENTS.md`](src/ee/services/pam/AGENTS.md) for a high-level map of the PAM backend — module layout, permission model, and non-obvious invariants. It is intentionally a concept map, not a spec: read the referenced code for implementation detail. If you add a feature, keep any addition there brief (a concept or invariant, not code mechanics).

**Certificate discovery**: before working on `pki-discovery-*` or `pki-installation-*`, read [`src/ee/services/pki-discovery/AGENTS.md`](src/ee/services/pki-discovery/AGENTS.md). Linux Server discovery splits work between the backend and the gateway's certificate scanner in the CLI repo, and keystore passwords live on installations, not jobs.

**Agent Vault**: the same applies to the `agent-vault-*` services and routers; the concept map is [`src/ee/services/agent-vault/AGENTS.md`](src/ee/services/agent-vault/AGENTS.md). PAM and Agent Vault are the two **org-scoped products**: one implicit project per org, resolved lazily, whose roles collapse to admin or member. Anything that branches on `ProjectType.PAM` (metering emits, predefined roles, the billable-project count, invite grants) almost always needs an Agent Vault arm too.

**Secret Scanning** is single-project (see the root `AGENTS.md`): `secret-scanning-v2-project-bootstrap.ts` creates the project with the org when it has a creator to make admin (like PAM and Agent Vault), `secret-scanning-v2-project-resolver.ts` picks the active project and lazily creates it, with every org admin as project admin, for older orgs and for orgs created from the admin console, whose admins are only invited after the org exists, and routes that take `projectId` read `req.internalSecretScanningProjectId`. A data source covers the resources it has rows for (added by a user or discovered from a push); its `config` only says where to look (Bitbucket workspace, GitLab group), never which resources, so scans, "included" state and GitLab account-scope webhooks all key off rows. Stored configs may still carry the old `includeRepos` / `includeProjects` keys, which nothing reads.

**Dynamic secrets:** lease data needed at revoke time goes in `dynamic_secret_leases.encryptedLeaseData`, never in a plaintext column. See [`src/ee/services/dynamic-secret/AGENTS.md`](src/ee/services/dynamic-secret/AGENTS.md).

**Gateways:** only `gateway-v2` and `gateway-pool` are live. A missing gateway must throw, never fall through to a direct dial, and any new path that attaches a gateway must call `assertIndividualGatewayAllowed`. See [`src/ee/services/gateway-v2/AGENTS.md`](src/ee/services/gateway-v2/AGENTS.md).

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
