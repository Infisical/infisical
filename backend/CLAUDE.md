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
- `*-queue.ts` — BullMQ async job handlers (when needed)
- `*-fns.ts` — pure utility functions (when needed)

### Route Handler Pattern

Routes use Fastify's Zod type provider — schemas auto-generate OpenAPI docs. Each route specifies: `method`, `url`, `config.rateLimit` (using `readLimit` or `writeLimit` presets), `schema` (Zod schemas with `operationId` for OpenAPI), `onRequest: verifyAuth([AuthMode.*])`, and a `handler` that accesses business logic via `server.services.*`.

See `src/server/routes/v3/user-router.ts` for a representative router file.

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

### Queue System (BullMQ)

Queue infrastructure in `src/queue/queue-service.ts`. Defines 30+ named queues via `QueueName` enum (e.g., `SecretRotation`, `AuditLog`, `IntegrationSync`, `SecretReplication`, `SecretSync`, `DynamicSecretRevocation`). Each queue has typed payloads defined in `TQueueJobTypes`.

Queue jobs support: delays, attempts with exponential/fixed backoff, cron-pattern repeats, and completion/failure cleanup.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

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

### Database Configuration

Knex config in `src/db/knexfile.ts`. Loads `.env.migration` then `.env`. Supports `DB_CONNECTION_URI` or individual host/port/user/name/password fields. Optional SSL via `DB_ROOT_CERT` (base64-encoded CA cert). Connection pool: min 2, max 10. Migrations table: `infisical_migrations`. Separate audit log DB supported via `auditlog-migration:*` scripts. ClickHouse for analytics (optional).

Migrations in `src/db/migrations/`. Auto-generated Zod schemas in `src/db/schemas/`.

## Wiring a New Feature (Checklist)

1. Create service module in `src/services/<name>/` (or `src/ee/services/<name>/` for EE) with DAL, service, and types files
2. If adding DB tables: create migration via `npm run migration:new`, run it, then `npm run generate:schema`
3. Wire in `src/server/routes/index.ts`: instantiate DAL → instantiate service → add to `server.decorate("services", {...})`
4. Create router in `src/server/routes/v<N>/` (or `src/ee/routes/v<N>/` for EE) and register it
5. Run `make reviewable-api` to verify lint + types
