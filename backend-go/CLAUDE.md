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

Never edit generated code in `gen/` directories — always regenerate.

## Code Rules

- **Linting**: All code must pass `make lint`. Do not suppress with `//nolint` unless clearly justified.
- **Context first**: Every function doing I/O or calling one **must accept `context.Context` as its first argument**. Exception: pure in-memory utility functions.
- **Explicit logger**: Services receive `*slog.Logger` via constructor — **never use `slog.Default()` or package-level `slog.*` functions** inside services. Tag with `logger.With("service", "name")`.
- **Interfaces for dependencies**: Consumer defines the interface (narrow, only needed methods). Accept interfaces, not concrete types.
- **Service constructor signature**: `<NewService|NewSharedService>(ctx context.Context, logger *slog.Logger, deps Deps)`. All external dependencies go in a `Deps` struct (name must end with `Deps`). The `exhaustruct` linter enforces every field is set at the call site — no silent nil dependencies.
- **DAL boundary**: Services must not import `table`, `postgres`, or `qrm`. All queries go through a DAL. Always use type-safe go-jet — no raw SQL (exception: `pg_advisory_xact_lock`).
- **Lean code**: Inline helpers with one caller. Only extract when shared. Split DAL files by functionality.

## Architecture

### Key Directories

```
cmd/infisical/main.go          # Entry point: config → DB → services.Registry → server
cmd/dev/pg_gen/main.go         # go-jet codegen utility
internal/
├── config/                    # Env-var config via koanf (186+ settings)
├── database/
│   ├── pg/gen/                # go-jet generated types (DO NOT EDIT)
│   ├── redis/                 # Redis client (standalone/cluster/sentinel)
│   └── ormify/                # Generic CRUD: DAL[M any] with FindByID, Create, Update, etc.
├── keystore/                  # Redis key-value + PG advisory locks
├── server/
│   ├── design/{platform,secretmanager}/  # Goa DSL (source of truth)
│   └── gen/                              # Goa generated (DO NOT EDIT)
├── services/
│   ├── services.go            # Root DI wiring (NewRegistry)
│   ├── shared/                # Cross-product: permission, kms, serverconfig, secretfolder
│   ├── platform/              # Platform services (projects, etc.)
│   └── secretmanager/         # Secret manager services (secrets, etc.)
└── testutil/                  # Test infra (testcontainers, fluent HTTP builder)
```

### Service & DI Pattern

Factory functions with explicit dependencies, wired in `services.go` via `NewRegistry()`. Three tiers:
1. **Shared** (`services/shared/`) — cross-product, instantiated once
2. **Product registries** (`services/platform/`, `services/secretmanager/`) — product-specific wiring
3. **Domain services** — implement Goa-generated interfaces

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
3. Create service in `internal/services/<product>/<name>/` implementing generated interface
4. Wire in `services.go`, mount in `internal/server/<product>.go`
5. Add tests with `setupMux()` pattern
6. `make test` + `make lint`
