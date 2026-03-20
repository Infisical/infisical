# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **backend-go** package of the Infisical monorepo — a partial Go rewrite of the Node.js backend using Goa v3 for API design and go-jet for type-safe SQL.

## Essential Commands

All commands run from the `backend-go/` directory:

- `make build` — build binary (`go build -o infisical ./cmd/infisical/...`)
- `make dev` — start hot-reloading server via docker-compose + air
- `make gen-goa` — regenerate HTTP handlers from Goa DSL definitions
- `make gen-db` — regenerate go-jet table types from live PostgreSQL schema
- `make test` — run integration tests (testcontainers, `-race`, 300s timeout)
- `make test-cleanup` — tear down test compose stack + remove state file

## Architecture

### Startup Flow

```
cmd/infisical/main.go
├─ Load config (koanf, env vars)
├─ Connect to DB (primary + read replicas)
├─ Bootstrap health checks
├─ Create services.Registry (wires all DI)
├─ Create server.Server (mounts product routes)
└─ Listen on configured addr
```

### Directory Structure

```
backend-go/
├── cmd/
│   ├── infisical/main.go          # Main server entry point
│   └── dev/pg_gen/main.go         # go-jet code generation utility
├── internal/
│   ├── config/                    # Centralized env-var config (koanf)
│   ├── database/
│   │   ├── pg/                    # PostgreSQL driver (primary + read replicas)
│   │   │   └── gen/               # go-jet generated table types (50+ tables)
│   │   ├── redis/                 # Redis client factory (standalone/cluster/sentinel)
│   │   └── ormify/                # Generic CRUD layer (DAL[M any])
│   ├── keystore/                  # Key-value store (Redis) + PG advisory locks
│   ├── libs/bootstrap/            # Startup health checks
│   ├── server/
│   │   ├── design/                # Goa DSL API definitions (source of truth)
│   │   │   ├── platform/          # Platform product routes
│   │   │   └── secretmanager/     # Secret Manager product routes
│   │   ├── gen/                   # Goa-generated code (DO NOT EDIT)
│   │   ├── server.go              # HTTP server + route mounting
│   │   ├── platform.go            # Mount platform routes
│   │   └── secretmanager.go       # Mount secret manager routes
│   ├── services/
│   │   ├── services.go            # Root registry wiring (DI entry point)
│   │   ├── platform/              # Platform product services
│   │   │   └── projects/          # Projects service
│   │   ├── secretmanager/         # Secret Manager product services
│   │   │   └── secrets/           # Secrets service
│   │   └── shared/                # Cross-product shared services
│   │       ├── permission/        # Permission checking
│   │       └── secretmanager/     # Product-scoped shared libs
│   │           └── secretfolder/  # Folder path resolution
│   └── testutil/                  # Test infrastructure
├── llm/                           # LLM-friendly architecture docs
├── Makefile
├── docker-compose.test.yml        # Test infrastructure (PG, Redis, Node.js)
├── Dockerfile.dev                 # Dev image with air hot-reload
└── .air.toml                      # Hot-reload config
```

### API Design (Goa DSL)

API definitions live in `internal/server/design/` using Goa v3 DSL. This is the **source of truth** — running `make gen-goa` generates HTTP handlers, types, encoders/decoders into `internal/server/gen/`. Never edit generated code in `gen/` directly.

Routes are organized by product line:
- `design/platform/` — platform routes (e.g., projects)
- `design/secretmanager/` — secret manager routes (e.g., secrets CRUD)

### Service Factory + Manual DI

Same pattern as the Node.js backend — no IoC container. All services are factory functions with explicit dependencies, wired in `internal/services/services.go` via `NewRegistry()`.

**Always use interfaces when consuming dependencies.** Services must accept dependencies as interfaces, not concrete types. This keeps packages decoupled and testable. The interface should be defined by the consumer (in the consuming package), not the provider. Use narrow interfaces — only the methods the consumer actually needs.

```go
// In the consuming service package — define the interface you need:
type keyStore interface {
    GetItem(ctx context.Context, key string) (string, error)
    SetItemWithExpiry(ctx context.Context, key string, expiry time.Duration, value string) error
}

type Service struct {
    keyStore keyStore // accept interface, not *keystore.redisKeyStore
}
```

Services are organized in a three-tier hierarchy:
1. **Shared services** (`services/shared/`) — cross-product (permission, secretfolder), instantiated once
2. **Product registries** (`services/platform/`, `services/secretmanager/`) — product-specific wiring, may instantiate product-scoped shared libs
3. **Domain services** (`services/platform/projects/`, `services/secretmanager/secrets/`) — implement Goa-generated service interfaces

### DAL Layer (Data Access)

Generic CRUD via `internal/database/ormify/` using Go generics (`DAL[M any]`). Provides: `FindByID`, `FindOne`, `Find`, `FindAll`, `Create`, `InsertMany`, `UpdateByID`, `Update`, `DeleteByID`, `Delete`, `Count`. Functional options for limit/offset/orderBy.

go-jet generated table types live in `internal/database/pg/gen/table/` (50+ tables, auto-generated — do not edit).

**Read replica pattern**: The `pg.DB` wrapper supports primary + read replica connection pools. Reads go to a random replica (with fallback to primary). Writes always hit primary.

**All database operations must go through a DAL, never directly from a service.** Services must not import `table`, `postgres`, or `qrm` packages or construct queries themselves. Instead, create or extend a DAL with the required method and call it from the service. This keeps query logic centralized and testable.

**Always use type-safe go-jet queries — never raw SQL.** Use go-jet's generated table types for all SELECT, INSERT, UPDATE, and DELETE operations. For UPDATE, use `Table.UPDATE(columns...).SET(values...).WHERE(...)` or the column-expression form `Column.SET(expression)`. See [go-jet UPDATE docs](https://github.com/go-jet/jet/wiki/UPDATE). Raw `tx.ExecContext(ctx, "UPDATE ...")` is not allowed — the only exception is PostgreSQL advisory locks (`pg_advisory_xact_lock`) which have no go-jet equivalent.

**Keep code lean.** Organize DAL files by functionality. If a helper function is only called once, inline it at the call site instead of extracting a separate method. Only extract shared helpers when they have multiple callers. Split files needed to organize similiar functionality ones

### Configuration

Environment variables loaded via koanf (`internal/config/config.go`). 186+ settings covering DB, Redis, auth, encryption, SSO, integrations, etc. Validated on startup with `config.ValidationError`.

### Testing

Integration tests using testcontainers-go with shared infrastructure:

1. **`testutil.SetupInfra()`** — acquires file lock, starts/reuses `docker-compose.test.yml` (PostgreSQL 14, Redis 7, Node.js backend), bootstraps org/user/identity tokens, saves state to `.test-infra-state.json`
2. **Per-test `setupMux()`** — instantiates real services + DALs, wires onto `testutil.TestMux` (httptest)
3. **Fluent test builder**:
   ```go
   mux.Request(t, http.MethodPost, "/api/v1/...").
       WithAuth(infra.IdentityToken).
       WithBody(payload).
       Do().
       ExpectStatus(http.StatusCreated).
       ParseJSON(&result)
   ```

Tests run with `-race` flag. Test infrastructure is shared across packages via file lock coordination — subsequent test packages reuse the running compose stack.

### Generated Code (Do Not Edit)

Two categories of generated code:
- **Goa generated** (`internal/server/gen/`) — regenerate with `make gen-goa`
- **go-jet generated** (`internal/database/pg/gen/`) — regenerate with `make gen-db`

Always regenerate rather than manually editing these directories.

## Wiring a New Feature (Checklist)

1. Define API in Goa DSL (`internal/server/design/<product>/`)
2. Run `make gen-goa` to generate handlers and types
3. Create domain service in `internal/services/<product>/<name>/` implementing the generated interface
4. If needed, add shared services in `internal/services/shared/`
5. Wire in `internal/services/services.go` (product registry → root registry)
6. Mount in `internal/server/<product>.go`
7. Add tests in the service package with `setupMux()` pattern
8. Run `make test` to verify
