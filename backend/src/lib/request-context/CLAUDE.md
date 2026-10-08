# Request-Scoped Memoization

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
