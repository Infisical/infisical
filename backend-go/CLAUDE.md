# backend-go

Partial Go rewrite of the Node.js backend using Goa v3 + go-jet.

## Commands

```
make build      # build binary
make dev        # hot-reload via docker-compose + air
make gen-goa    # regenerate Goa handlers (design/ → gen/)
make gen-db     # regenerate go-jet types from DB
make test       # integration tests (testcontainers, -race)
make lint       # must pass before submission
make lint-fix   # auto-fix linting issues
```

Never edit `gen/` directories — always regenerate.

## Code Rules

- **Linting**: `make lint` must pass. No `//nolint` unless justified.
- **Constructor**: `(logger *slog.Logger, deps Deps)` — deps struct name ends with `Deps`.
- **Context**: Every I/O method takes `context.Context` first. Constructors are the exception.
- **Logger**: Pass `*slog.Logger` via constructor — never use `slog.Default()`.
- **Interfaces**: Service Consumer defines narrow interfaces. Accept interfaces, not concrete types.
- **DAL boundary**: Services must not import `table`, `postgres`, `qrm`. Use go-jet only.
- **Error wrapping**: Wrap DAL errors at caller level with context:
  ```go
  errutil.DatabaseErr("Failed to load").WithErrf("FuncName(arg=%s): %w", arg, err)
  errutil.Forbidden("Access denied").WithErrf("FuncName: permission check failed")
  ```
- **Lean code**: Inline single-use helpers. Split DAL files by functionality.

## Architecture

```
cmd/infisical/main.go           # Entry point
internal/
├── config/                     # Env config via koanf
├── database/
│   ├── pg/gen/                 # go-jet generated (DO NOT EDIT)
│   ├── redis/                  # Redis client
│   └── ormify/                 # Generic CRUD: DAL[M] with Find/Create/Update/Delete
├── server/
│   ├── design/                 # Goa DSL definitions
│   ├── gen/                    # Goa generated (DO NOT EDIT)
│   └── api/                    # Endpoint implementations + DI wiring
├── services/                   # Shared business logic (auth, permission, kms)
└── testutil/                   # Test infra (testcontainers)
```

**Two tiers:**
- `server/api/` — Goa endpoint implementations. 1:1 with endpoints. Not imported elsewhere.
- `services/` — Shared logic. No Goa dependency.

**DAL**: `ormify.DAL[M]` provides `FindByID`, `Find`, `Create`, `Update`, `Delete`, `Count`.

**Read replicas**: `pg.DB` wraps primary + replica pools. Reads hit replicas, writes hit primary.

### Go-Jet Nesting

For JOINs with one-to-many, use struct tags:

```go
type Secret struct {
    ID   uuid.UUID   `sql:"primary_key" alias:"secrets_v2.id"`
    Tags []SecretTag `alias:"secret_tags"`
}
type SecretTag struct {
    ID   uuid.UUID `sql:"primary_key" alias:"secret_tags.id"`
    Slug string    `alias:"secret_tags.slug"`
}
```

Go-jet auto-groups slices. Requires `sql:"primary_key"` on IDs.

## Wiring a New Feature

1. Define API in Goa DSL (`server/design/<product>/`)
2. `make gen-goa`
3. Implement in `server/api/<product>/<name>/`
4. Wire in `api.go`
5. Add tests, run `make test && make lint`, auto fix lint command `make lint-fix`
