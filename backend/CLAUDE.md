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

### Outbound HTTP & SSRF Protection

Anywhere the backend issues an HTTP request to a URL derived from user input (webhooks, integrations, app connections, OIDC/JWKS, audit log streams, ACME, etc.), use the `safeRequest` helper from `@app/lib/validator` instead of the raw `request` (Axios) client.

```ts
import { safeRequest } from "@app/lib/validator";

// Replace:
//   await blockLocalAndPrivateIpAddresses(url);
//   await request.post(url, body, { headers, timeout });
// With:
const res = await safeRequest.post<TResponse>(url, body, { headers, timeout });
```

`safeRequest` (in `src/lib/validator/validate-url.ts`) does three things atomically in one call:
1. **Validates** the URL — rejects local/private IPs, Infisical's own DB/Redis hosts, URLs with embedded credentials.
2. **Pins** the connection — resolves the hostname once, then installs a custom `lookup` on a per-request `http(s).Agent` so the connect-time DNS call returns the validated IP. This closes the DNS-rebinding TOCTOU between the validation lookup and Axios's connect lookup. Pre-validating with `blockLocalAndPrivateIpAddresses` and *then* calling raw `request` does **not** close this window; only `safeRequest` does.
3. **Disables redirects** (`maxRedirects: 0`). For redirect-following GETs that need to validate each hop, use `ssrfSafeGet` instead — it loops on top of the same pinned-agent dispatcher.

**Available methods** (all return Axios-shaped `AxiosResponse<T>`):
- `safeRequest.get<T>(url, opts?)`
- `safeRequest.post<T>(url, body, opts?)`
- `safeRequest.put<T>(url, body, opts?)`
- `safeRequest.patch<T>(url, body, opts?)`
- `safeRequest.delete<T>(url, opts?)`
- `safeRequest.request<T>(config)` — full Axios-style config; **`config.url` must be `string`** (not `string | undefined`). When wrapping in helper types, use `AxiosRequestConfig & { url: string }` to enforce at compile time.

Generic `T` defaults to `any` to mirror Axios so `safeRequest` is a near-drop-in replacement for raw `request`.

**When to use what:**
- `safeRequest.{get,post,put,patch,delete,request}` — most outbound HTTP. URL comes from user/admin config or stored data.
- `ssrfSafeGet` — when redirects must be followed (e.g. fetching JWKS or OIDC discovery docs that may 302). Re-validates and re-pins each hop. **If you find yourself wanting to set `maxRedirects > 0` directly on a `safeRequest` config, the answer is `ssrfSafeGet`, not raising the cap.**
- `ssrfSafePost` — POSTs that need to opt into `allowPrivateIps` (rare, used by AI MCP server).
- `buildSsrfSafeAgent` — when a third-party HTTP client (`jwks-rsa`'s `JwksClient`, `openid-client`, `axios-ntlm`, etc.) builds its own Axios/`got`/`http` client and won't accept a wrapped instance. See "Third-party HTTP clients that build their own agent" below.
- `blockLocalAndPrivateIpAddresses` directly — two cases:
  1. **Save-time / config-time validation** — reject obviously bad URLs at the API edge before persisting. Defense-in-depth, not a substitute for `safeRequest` at request time.
  2. **Truly non-HTTP clients** — LDAP, SSH, SMB, ssh2, ldapjs, raw TCP, etc. — where there is no `http.Agent` to install a `lookup` on. For HTTP clients that take an agent, use `buildSsrfSafeAgent` instead; falling back to `blockLocalAndPrivateIpAddresses` here loses DNS pinning.

**Agent customization (TLS extras)**

`safeRequest` builds its own pinned `http(s).Agent` per request. To preserve the pinning, do **not** pass a pre-built `httpsAgent` in the config — it would replace the pinned agent and disable rebinding protection. Instead pass these flat options and `safeRequest` bakes them into the pinned agent:

| Option | Purpose | Example |
|---|---|---|
| `ca` | Custom CA cert(s) for HTTPS — `string \| string[]` | NetScaler, Venafi TPP, self-hosted K8s API |
| `rejectUnauthorized` | Allow self-signed/invalid certs (use sparingly) | Internal services that ship their own CA |
| `servername` | TLS SNI when connecting by IP — cert verifies against the original hostname | Kubernetes API servers |
| `addressFamily` | Force IPv4 (`4`) or IPv6 (`6`) — filters the validated IP set | Azure App Configuration in our docker setup |
| `keepAlive` | Persistent TCP connection across the multi-step handshake. Only for protocols that genuinely need it — connection pooling otherwise widens the blast radius if a pinned IP misbehaves. | NTLM (Azure ADCS) |
| `checkServerIdentity` | Override the default hostname-vs-cert check. Set to `() => undefined` only when the cert is presented for an IP literal and the trust boundary is the explicit CA. | Azure ADCS web enrollment with IP-pinned certs |

Migration tip: when refactoring code that built a custom `https.Agent`, drop the agent and forward `ca` / `rejectUnauthorized` / `servername` as flat options; `safeRequest` will compose them into its pinned agent.

**Opt-outs that skip pinning** (in all three, `safeRequest` falls back to Axios's default agent and there is no rebinding protection):
- `NODE_ENV=development` — validation is bypassed entirely.
- Calling `blockLocalAndPrivateIpAddresses(url, isGateway = true)` — gateway-routed traffic doesn't go through Axios DNS, so pinning would do nothing.
- `allowPrivateIps: true` option — caller skips the private-IP refusal **and** DNS pinning **and** the Infisical internal-infrastructure blocklist (`verifyHostInputValidity`). `validateSsrfUrl` short-circuits when this flag is set, so no DNS resolution happens at validation time and Node's default resolver is used at connect time.

**`allowPrivateIps: true` is only acceptable when there is a stronger runtime trust boundary than the IP class** (e.g., TLS cert verification + cluster token, or save-time host validation). The flag does not preserve rebinding protection or the internal-infra blocklist on its own.

**Gateway-aware patterns**

Some integrations route through an Infisical gateway (a TCP/HTTP tunnel to an in-customer-network agent). The gateway opens a localhost listener and the backend connects to `https://localhost:<ephemeralPort>`. Two patterns exist:

- **Single HTTP call per logical operation** (HC Vault, GitHub, Venafi TPP, NetScaler) — implemented as a per-app `requestWithXGateway` wrapper that branches once: gateway path uses raw `request` with the relay-supplied `httpsAgent` (preserves the relay TLS context); direct path uses `safeRequest` with the user's `ca` / `servername`. Pattern lives in each `*-connection-fns.ts`. Tighten the wrapper's `requestConfig` parameter type to `AxiosRequestConfig & { url: string }` so call sites must supply a URL — avoids `as string` casts.
- **Multi-step conversations under one callback** (only Kubernetes today) — a per-request HTTP-client factory (`k8sHttpClient` in `ee/services/dynamic-secret/providers/kubernetes.ts`) selects `request` vs `safeRequest` and translates `httpsAgent` → flat `ca` / `rejectUnauthorized` for the direct path. Used because a single callback closure runs many K8s API calls in either gateway-tunneled or direct mode.

**Third-party HTTP clients that build their own agent**

Some libraries (`jwks-rsa`'s `JwksClient`, `axios-ntlm`) instantiate their own HTTP client internally and don't accept a wrapped `axios` instance. They do typically expose a `requestAgent` / `agent` / `httpsAgent` injection point. For those, use `buildSsrfSafeAgent` from `@app/lib/validator` — it runs the same validation as `safeRequest` and returns an `http.Agent` / `https.Agent` with the validated IPs pinned via a custom `lookup`.

```ts
import { buildSsrfSafeAgent } from "@app/lib/validator";

const agent = await buildSsrfSafeAgent(jwksUri, {
  ca: caCert || undefined,
  rejectUnauthorized: true
});

const client = new JwksClient({ jwksUri, requestAgent: agent });
```

Existing call sites:
- Identity OIDC JWKS — `src/services/identity-oidc-auth/identity-oidc-auth-service.ts`
- Identity JWT JWKS — `src/services/identity-jwt-auth/identity-jwt-auth-service.ts`
- Azure ADCS NTLM — `src/services/app-connection/azure-adcs/azure-adcs-connection-fns.ts` (passes `keepAlive: true` and `checkServerIdentity: () => undefined`)

Anti-pattern: don't reach for `blockLocalAndPrivateIpAddresses(url)` followed by handing the library an unsafe agent — you'd lose DNS pinning and reintroduce the rebinding TOCTOU.

**When you add a new outbound flow**

1. Use `safeRequest` (or `buildSsrfSafeAgent` for third-party clients) by default.
2. Decide deliberately whether the flow needs `allowPrivateIps: true`. The default is no.

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
