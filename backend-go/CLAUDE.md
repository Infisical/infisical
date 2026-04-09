# CLAUDE.md

This is the **backend-go** package — a partial Go rewrite of the Node.js backend using Goa v3 for API design and go-jet for type-safe SQL.

## Commands

All commands run from `backend-go/`:

- `make build` — build binary
- `make dev` — hot-reloading server via docker-compose + air
- `make gen-goa` — regenerate Goa HTTP handlers from DSL (`internal/server/design/` → `internal/server/gen/`)
- `make gen-db` — regenerate go-jet table types from DB (`internal/database/pg/gen/`)
- `make test` — integration tests (testcontainers, `-race`, 300s timeout)
- `make lint` — **must pass before submission**
- `make lint-fix` — **use to fix auto fixable ones**

Never edit generated code in `gen/` directories — always regenerate.

## Code Rules

- **Linting**: All code must pass `make lint`. Do not suppress with `//nolint` unless clearly justified.
- **Constructor signature**: Both services and DALs initialize with `(logger *slog.Logger, deps Deps)`. All external dependencies go in a `Deps` struct (name must end with `Deps`). The `exhaustruct` linter enforces every field is set at the call site — no silent nil dependencies.
- **Context everywhere**: Every service and DAL method that does I/O **must accept `context.Context` as its first argument**. Constructors are the only exception.
- **Explicit logger**: Services and DALs receive `*slog.Logger` via constructor — **never use `slog.Default()` or package-level `slog.*` functions**. Tag with `logger.With("service", "name")`.
- **Interfaces for dependencies**: Consumer defines the interface (narrow, only needed methods). Accept interfaces, not concrete types.
- **DAL boundary**: Services must not import `table`, `postgres`, or `qrm`. All queries go through a DAL. Always use type-safe go-jet — no raw SQL (exception: `pg_advisory_xact_lock`).
- **Database error wrapping**: All `err` values returned from DAL/database calls must be wrapped with `errutil.DatabaseErr("<user-facing message>").WithErr(err)` at the service/caller level, NOT inside DAL methods. This logs the real DB error internally but only shows the safe message to clients.
- **Error cause context**: When returning `errutil` service errors, always attach origin context via `.WithErr()` using `fmt.Errorf` with the function name and relevant args: `errutil.DatabaseErr("Failed to load resource").WithErr(fmt.Errorf("secretfolder.LoadProjectFolders(project=%s): %w", projectID, err))`. Keep client-facing messages generic — the cause is never exposed to clients, it only appears in server logs alongside the Goa service/method from context.
- **Lean code**: Inline helpers with one caller. Only extract when shared. Split DAL files by functionality.

## Architecture

### Key Directories

```
cmd/infisical/main.go          # Entry point: config → DB → api.Registry → server
cmd/dev/pg_gen/main.go         # go-jet codegen utility
internal/
├── config/                    # Env-var config via koanf (186+ settings)
├── database/
│   ├── pg/gen/                # go-jet generated types (DO NOT EDIT)
│   ├── redis/                 # Redis client (standalone/cluster/sentinel)
│   └── ormify/                # Generic CRUD: DAL[M any] with FindByID, Create, Update, etc.
├── keystore/                  # Redis key-value + PG advisory locks
├── server/
│   ├── design/
│   │   ├── auth/              # Goa security schemes (JWT, identity, service token)
│   │   ├── common/            # Shared error types
│   │   ├── platform/          # Platform Goa DSL
│   │   └── secretmanager/     # Secret manager Goa DSL
│   ├── gen/                   # Goa generated (DO NOT EDIT)
│   └── api/                   # Goa endpoint implementations
│       ├── api.go             # Root DI wiring (NewRegistry)
│       ├── platform/          # Platform API (projects, etc.)
│       └── secretmanager/     # Secret manager API (secrets, etc.)
├── services/                  # Shared business logic (cross-product)
│   ├── libs.go                # SharedServices wiring
│   ├── auth/                  # Authentication & token validation
│   ├── permission/            # CASL-based permission checks
│   ├── kms/                   # Key management service
│   ├── license/               # License validation
│   ├── secretmanager/         # Shared secret manager services (secretfolder, secretimport)
│   └── serverconfig/          # Server configuration
└── testutil/                  # Test infra (testcontainers, fluent HTTP builder)
```

### Two-Tier Service Architecture

- **`server/api/`** — Goa endpoint implementations. Each module implements a Goa-generated `Service` interface and orchestrates shared services. Always 1:1 with a Goa endpoint. These should NOT be imported by anything outside `server/`.
- **`services/`** — Shared business logic (auth, permission, kms, etc.). Consumed by API implementations and by each other. No dependency on Goa-generated code.

DI wiring: `api.NewRegistry()` constructs shared services first, then passes them into product-specific API registries.

### Data Access (DAL)

`ormify.DAL[M any]` provides: `FindByID`, `FindOne`, `Find`, `FindAll`, `Create`, `InsertMany`, `UpdateByID`, `Update`, `DeleteByID`, `Delete`, `Count` with functional options (limit/offset/orderBy).

**Read replica pattern**: `pg.DB` wraps primary + replica pools. Reads go to a random replica (fallback to primary). Writes always hit primary.

### Testing

Integration tests with testcontainers-go (PostgreSQL 14, Redis 7, Node.js backend):

```go
mux.Request(t, http.MethodPost, "/api/v1/...").
    WithAuth(infra.IdentityToken).
    WithBody(payload).
    Do().
    ExpectStatus(http.StatusCreated).
    ParseJSON(&result)
```

Tests run with `-race`. Infrastructure shared across packages via file lock + `.test-infra-state.json`.

## Wiring a New Feature

1. Define API in Goa DSL (`internal/server/design/<product>/`)
2. `make gen-goa`
3. Create API implementation in `internal/server/api/<product>/<name>/` implementing generated interface
4. Wire in `api.go`, mount in `internal/server/<product>.go`
5. Add tests with `setupMux()` pattern
6. `make test` + `make lint`
