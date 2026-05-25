# backend-go

Partial Go rewrite of the Node.js backend using chi + chita framework + raw pgx queries.

## Commands

```
make build      # build binary
make dev        # hot-reload via docker-compose + air
make test       # integration tests (testcontainers, -race)
make lint       # must pass before submission
make lint-fix   # auto-fix linting issues
```

## Code Rules

- **Linting**: `make lint` must pass. No `//nolint` without justification.
- **Service Constructor signature**: `(ctx context.Context, logger *slog.Logger, deps *Deps)`. Deps struct name ends with `Deps`, passed by pointer. Every I/O method (including constructors) takes `context.Context` first.
- **Logger**: Pass `*slog.Logger` via constructor — never `slog.Default()`.
- **Interfaces**: Consumer-defined — both handlers and services declare narrow interfaces for their dependencies. Accept interfaces, not concrete types.
- **Visibility**: Expose only what's needed; everything else lowercase.
- **No DAL layer**: Services use `pg.DB` directly with raw pgx queries.
- **Error wrapping**: Wrap DB errors at service level with context:
  ```go
  errutil.DatabaseErr("Failed to load").WithErrf("FuncName(arg=%s): %w", arg, err)
  errutil.Forbidden("Access denied").WithErrf("FuncName: permission check failed")
  ```
- **Lean code**: Inline single-use helpers.
- **Test naming**: `Test<FunctionName>_<Scenario>`.

## Architecture

```
cmd/infisical/main.go           # Entry point
internal/
├── config/                     # Env config via koanf
├── database/
│   ├── pg/
│   │   ├── pg.go               # DB interface (primary + replicas via pgxpool)
│   │   ├── qb/                 # Query builders (Where, Insert, Update, Delete)
│   │   ├── sqln/               # SQL nesting (GroupRows for LEFT JOIN flattening)
│   │   └── pglock/             # PostgreSQL advisory locks
│   └── redis/                  # Redis client
├── libs/
│   ├── crypto/                 # Cryptographic utilities (cipher, hash, sign)
│   ├── errutil/                # Error types and formatting
│   ├── fn/                     # Generic utilities (AppendUnique, etc.)
│   └── logutil/                # Logging utilities (context handler)
├── server/
│   ├── api/                    # Endpoint implementations + DI wiring
│   ├── auth/                   # Security registry + auth validators
│   └── middlewares/            # HTTP middlewares (httpinfo, identity, etc.)
├── services/                   # Shared business logic (auth, permission, kms)
├── keystore/                   # Redis key-value operations
└── testutil/                   # Test infra (testcontainers)
pkg/
└── api/                        # HTTP routing framework (chi + OpenAPI)
```

**Two tiers:**
- `server/api/` — DI wiring + chi endpoint implementations. Handlers 1:1 with endpoints.
- `services/` — Business logic. Uses `pg.DB` directly.

### Wiring (Composition Root)

All service/handler initialization lives in `server/api/`:

```
server/api/
├── api.go                         # Infra, Registry, NewRegistry()
├── platform_services.go           # newPlatformServices() — kms, auth, permission, etc.
├── secretmanager_services.go      # newSecretManagerServices() — secret, folder, import
├── platform_handlers.go           # newPlatformHandlers()
├── secretmanager_handlers.go      # newSecretManagerHandlers()
├── platform/<handler>/            # Handler implementations only
└── secretmanager/<handler>/       # Handler implementations only
```

Pattern: initialize as local variables first, then assign to struct fields.

### Handler Package Structure

Each handler package follows this structure:

```
server/api/<product>/<handler>/
├── models.go      # ALL request/response types with Schema() methods
├── <endpoint>.go  # Handler methods (e.g., list_secrets.go, get_secret.go)
├── routes.go      # Route registration with RegisterRoutes()
└── secret.go      # Handler struct, NewHandler(), and dependencies
```

**models.go**: All request inputs and response outputs must be defined here. Includes shared types like `SecretRaw`, `SecretTag`, etc.

### Handler Pattern

Handlers use the `chita` framework with typed request/response structs:

```go
// models.go - ALL request/response types with Schema() for validation + OpenAPI
type GetSecretRequest struct {
    SecretName  string `json:"-"`
    ProjectID   string `json:"projectId"`
    Environment string `json:"environment"`
}

func (r *GetSecretRequest) Schema() *chita.ObjectSchema {
    return chita.Object(map[string]chita.Schema{
        "secretName":  chita.String(&r.SecretName).From(chita.SourcePath).Required(),
        "projectId":   chita.String(&r.ProjectID).From(chita.SourceQuery).Required(),
        "environment": chita.String(&r.Environment).From(chita.SourceQuery).Required(),
    })
}

type GetSecretResponse struct {
    chita.StatusOK
    Secret *SecretRaw `json:"secret"`
}

func (r *GetSecretResponse) Schema() *chita.ObjectSchema {
    return chita.Object(map[string]chita.Schema{
        "secret": (&SecretRaw{}).Schema().Required(),
    })
}

// Shared response types also go in models.go
type SecretRaw struct {
    ID          string       `json:"id"`
    SecretKey   string       `json:"secretKey"`
    SecretValue string       `json:"secretValue"`
    // ...
}

func (r *SecretRaw) Schema() *chita.ObjectSchema {
    return chita.Object(map[string]chita.Schema{
        "id":          chita.String(&r.ID).Required(),
        "secretKey":   chita.String(&r.SecretKey).Required(),
        "secretValue": chita.String(&r.SecretValue),
    })
}

// get_secret.go - Handler method
func (h *Handler) GetSecret(ctx context.Context, req *GetSecretRequest) (GetSecretResponse, error) {
    // ... implementation
    return GetSecretResponse{Secret: secret}, nil
}

// routes.go - Route registration
func RegisterRoutes(router *chita.Router, app *chita.App, handler *Handler) {
    router.Route("/api/v4/secrets", func(r *chita.Router) {
        r.WithTags("Secrets")
        r.GET("/{secretName}", chita.Handler(app, handler.GetSecret).
            Summary("Get a secret by name").
            OperationID("getSecretByNameV4"))
    })
}
```

### Handler vs Service Responsibilities

**Handlers** (`server/api/`) — thin orchestration:
1. Extract identity from context
2. Call permission service for user permissions
3. Resolve IDs (e.g., project ID from slug) via shared services
4. Call domain service with opts (including AccessChecker for permission filtering)
5. Build API response from service result
6. Create audit logs

**Services** (`services/`) — domain logic: data fetching/aggregation, decryption/encryption, permission filtering (via AccessChecker in opts), business rules (import chaining, secret expansion, personal overrides).

**AccessChecker pattern**: Services accept an optional `AccessChecker` interface in opts. Pass `nil` to skip permission checks (internal/integration use). Keeps permission logic in handlers while letting services enforce it.

**Database access**: Services receive `pg.DB` and execute raw pgx queries via helper packages. `pg.DB` wraps primary + replica pools — use `db.Primary()` for writes, `db.Replica()` for reads.

### Query Helpers

**`qb` package** — dynamic SQL builders:

```go
// WHERE (SELECT with named args)
args := pgx.NamedArgs{"folderID": folderID}
where := qb.NewWhere().
    Add("folder_id = @folderID").
    AddIf(len(keys) > 0, "key = ANY(@keys)")
args["keys"] = keys
query := `SELECT * FROM secrets WHERE ` + where.String()
rows, err := db.Replica().Query(ctx, query, args)

// INSERT (numbered args for bulk)
sql, args := qb.Insert("secrets", "id", "key", "folder_id").
    Values(id1, key1, folder1).
    Values(id2, key2, folder2).
    Returning("*").
    Build()

// UPDATE (named args)
sql, args := qb.Update("secrets").
    Set("key", newKey).
    Where("id = @id", "id", id).
    Returning("*").
    Build()

// DELETE (named args)
sql, args := qb.Delete("secrets").
    Where("id = @id", "id", id).
    Build()
```

**`sqln` package** — flatten LEFT JOIN rows into nested structs:

```go
secrets := sqln.GroupRows(flatSecrets, sqln.Grouper[Secret, uuid.UUID]{
    Key: func(s *Secret) uuid.UUID { return s.ID },
    Merge: func(existing, row *Secret) {
        if len(row.Tags) > 0 {
            existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0],
                func(t Tag) uuid.UUID { return t.ID })
        }
    },
})
```

**`pglock` package** — PostgreSQL advisory locks:

```go
tx, _ := db.Primary().Begin(ctx)
lock, err := pglock.AcquireBlockingLock(ctx, tx, "my_lock_id")
if err != nil {
    tx.Rollback(ctx)
    return err
}
defer lock.Rollback(ctx)  // safety net
// ... do work within lock ...
lock.Release(ctx)  // commits transaction
```

### Writing Raw Queries

Use `pgx.NamedArgs` for parameterized queries:

```go
query := `
    SELECT id, key, encrypted_value
    FROM secrets_v2
    WHERE folder_id = @folderID AND user_id IS NULL
    ORDER BY key ASC
`
args := pgx.NamedArgs{"folderID": folderID}
rows, err := db.Replica().Query(ctx, query, args)
```

**Table aliases**: clear, readable — not single letters. E.g., `memberships m`, `membership_roles mr`, `organizations o`, `additional_privileges ap`. Obvious abbreviations of the table name.

Scan with `pgx.CollectRows` or manually:

```go
secrets, err := pgx.CollectRows(rows, pgx.RowToStructByName[Secret])
```

## Wiring a New Feature

1. Create service in `services/<product>/<name>/` with interface-based deps
2. Create handler in `server/api/<product>/<name>/`:
   - `models.go` — ALL request/response types with `Schema()` methods
   - `<handler>.go` — handler struct, `NewHandler()`, and dependencies
   - `<endpoint>.go` — handler methods (e.g., `list_secrets.go`, `get_secret.go`)
   - `routes.go` — route registration with `RegisterRoutes()`
3. Add service init to `server/api/<product>_services.go`
4. Add handler init to `server/api/<product>_handlers.go`
5. Register routes in `server/routes.go`
6. Add tests, run `make test && make lint`
