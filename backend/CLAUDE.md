# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

The backend code quality guide is imported below, so it is always in context for work in this package. **Check every change against it, whatever the change is, before calling the task done.** This file covers *where* code goes and *which* pattern to follow; the quality guide covers the minimum any implementation has to handle. It is a deliberately non-exhaustive floor, so the topics it happens to cover are not a filter for whether it applies.

@CODE_QUALITY.md

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

## Module instructions

These load automatically when you read a file in that folder. Read the file directly when your change touches the area without opening one of its files.

| Task | Read |
|---|---|
| Adding `AuthMode.OAUTH` to a route, adding an Administration route, or changing how OAuth tokens are issued or exchanged | `src/services/oauth-client/CLAUDE.md` |
| Changing how an invite, removal, SCIM, or SSO login path finds a user, or syncing a user's email or name from an IdP | `src/services/user-alias/CLAUDE.md` |
| Changing role or privilege assignment, identity auth method access, project permission caching, or a folder grant, rename, move, or delete path | `src/ee/services/permission/CLAUDE.md` |
| Adding `requestMemoize` to a call | `src/lib/request-context/CLAUDE.md` |
| Adding queued or background work | `src/queue/CLAUDE.md` |
| Adding recurring or scheduled work, or a per-process refresh | `src/lib/cron/CLAUDE.md` |
| Adding or changing an alert provider or channel, or deleting or detaching an alertable resource | `src/services/alert/CLAUDE.md` |
| Emitting a domain event, or adding an event consumer | `src/services/event-outbox/CLAUDE.md` |
| Soft-deleting a resource, deleting rows in bulk, or adding a foreign key that takes part in a cascade | `src/db/CLAUDE.md` |
| Making a long-running route stop when its client disconnects | `src/server/lib/CLAUDE.md` |
| Adding a code path that revokes a certificate, changing CA signing (`TCaSigner`), or changing CRL or OCSP | `src/ee/services/certificate-authority-ocsp/CLAUDE.md` |
| Adding a dynamic secret provider, or changing what a provider stores in its config or lease | `src/ee/services/dynamic-secret/CLAUDE.md` |
| Touching a gateway dial path, or attaching a gateway to a resource | `src/ee/services/gateway-v2/CLAUDE.md` |
| Adding an audit log event type, collapsing an audit log event, or changing audit log settings | `src/ee/services/audit-log/CLAUDE.md` |
| Adding or changing a server plugin | `src/server/plugins/CLAUDE.md` |
| Adding or changing an OpenTelemetry metric or its attributes | `src/lib/telemetry/CLAUDE.md` |
| Changing PostHog event aggregation | `src/services/telemetry/CLAUDE.md` |
| Changing root encryption key rotation, or calling a `*WithRootEncryptionKey` function | `src/services/kms/CLAUDE.md` |
| Writing an e2e test that fakes a third-party provider | `e2e-test/CLAUDE.md` |
| Editing `Dockerfile.fips-toolchain` or `Dockerfile.dev.fips`, or building the backend image without GHCR | [`FIPS_TOOLCHAIN.md`](FIPS_TOOLCHAIN.md) |

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
  `JWT`, told apart by an `oauthClientId` claim. See [Delegated OAuth tokens](src/services/oauth-client/CLAUDE.md).

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

Built-in roles: `Admin`, `Member`, `Viewer`, `NoAccess`. For PAM and Agent Vault `getPredefinedRoles` (`project-role-fns.ts`) returns only `Admin` and `Member`, because their permission dispatch resolves every other slug to the member set; the role factory delegates to that one function, so every role picker follows. Custom roles use unpacked CASL rules stored in the database. Rules can include conditions with operators `$IN`, `$EQ`, `$NEQ`, `$GLOB` (for pattern matching like `prod-*`). See `PermissionConditionSchema` in `permission-types.ts`.

**Deny an RBAC check by throwing through CASL, never with `ForbiddenRequestError`.** `audit-log-permission-denied.ts` records a permission-denied audit event for every CASL `ForbiddenError` and `PermissionBoundaryError` a request throws, and skips plain `ForbiddenRequestError` because most of those are auth-mode, plan and ownership refusals. A service that calls `permission.can()` and throws `ForbiddenRequestError` itself therefore produces no denial event, and nothing fails to tell you. When the check has a fallback (a second action, an approver, an application grant), test the fallbacks first and make `ForbiddenError.from(permission).throwUnlessCan(...)` the last check, so the denial is recorded with a real action and subject. Keep `ForbiddenRequestError` for refusals that are not about a permission.

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
- `ClientClosedRequestError` (499, nginx convention) — the client disconnected before the response was written; see `src/server/lib/CLAUDE.md`

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

**Never log an outbound URL verbatim — a URL is often itself a credential.** Incoming-webhook providers put the bearer secret in the path (`https://hooks.slack.com/services/T…/B…/<secret>`, Discord, Teams, Telegram) and many APIs accept a token as a query param, so a raw URL in a log line ships a working credential to the log sink. Pass it through `sanitizeUrlForLog` from `@app/lib/logger` first (`src/lib/logger/sanitize-url.ts`): it keeps only the origin, strips userinfo and the fragment, redacts the entire path, and redacts every query value. Token formats can't be recognised reliably, so the path is redacted by default for every host rather than sniffed with heuristics. The global axios response interceptor (`src/lib/config/request.ts`) and `safeRequest`'s dispatch log already do this.

Note that `logger.ts` also has a `redactedKeys` list applied to structured-object fields up to depth three. It only matches by key name, so it does **not** help with a secret embedded in a `url` field.

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:
- `src/ee/services/` — 60+ service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/` — 63 EE route files; `src/ee/routes/v2/` — 10 v2 route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/CLAUDE.md`](src/ee/services/pam/CLAUDE.md) for a high-level map of the PAM backend — module layout, permission model, and non-obvious invariants. It is intentionally a concept map, not a spec: read the referenced code for implementation detail. If you add a feature, keep any addition there brief (a concept or invariant, not code mechanics).

**Agent Vault**: the same applies to the `agent-vault-*` services and routers; the concept map is [`src/ee/services/agent-vault/CLAUDE.md`](src/ee/services/agent-vault/CLAUDE.md). PAM and Agent Vault are the two **org-scoped products**: one implicit project per org, resolved lazily, whose roles collapse to admin or member. Anything that branches on `ProjectType.PAM` (metering emits, predefined roles, the billable-project count, invite grants) almost always needs an Agent Vault arm too.

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
