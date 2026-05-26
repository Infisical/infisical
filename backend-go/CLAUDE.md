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
- **Service constructor**: `(ctx context.Context, logger *slog.Logger, deps *Deps)`. Deps struct ends in `Deps`, passed by pointer. Every I/O method takes `ctx` first.
- **Logger**: pass `*slog.Logger` via constructor — never `slog.Default()`.
- **Interfaces**: consumer-defined. Accept interfaces, not concrete types.
- **Visibility**: expose only what's needed.
- **No DAL layer**: services use `pg.DB` directly with raw pgx.
- **Error wrapping**: wrap DB errors at service level with context:
  ```go
  errutil.DatabaseErr("Failed to load").WithErrf("FuncName(arg=%s): %w", arg, err)
  errutil.Forbidden("Access denied").WithErrf("FuncName: permission check failed")
  ```
- **Lean code**: inline single-use helpers.
- **Test naming**: `Test<FunctionName>_<Scenario>`.

## Architecture

```
cmd/infisical/main.go           # Entry point
internal/
├── config/                     # Env config via koanf
├── database/
│   ├── pg/                     # DB interface (primary + replicas via pgxpool)
│   │   ├── qb/                 # Query builders (Where, Insert, Update, Delete)
│   │   ├── sqln/               # SQL nesting (GroupRows for LEFT JOIN flattening)
│   │   └── pglock/             # PostgreSQL advisory locks
│   └── redis/                  # Redis client
├── libs/                       # crypto, errutil, fn, logutil
├── server/
│   ├── api/                    # Endpoint implementations + DI wiring
│   ├── auth/                   # Security registry + auth validators
│   └── middlewares/            # HTTP middlewares
├── services/                   # Shared business logic (auth, permission, kms, ...)
├── keystore/                   # Redis key-value operations
└── testutil/                   # Test infra (testcontainers)
pkg/api/                        # HTTP routing framework (chi + OpenAPI)
```

**Two tiers:**
- `server/api/` — DI wiring + chi endpoint implementations. Handlers 1:1 with endpoints.
- `services/` — Business logic, uses `pg.DB` directly.

### Wiring (Composition Root)

All service/handler initialization lives in `server/api/`:

```
server/api/
├── api.go                         # Infra, Registry, NewRegistry()
├── platform_services.go           # newPlatformServices() — kms, auth, permission, etc.
├── secretmanager_services.go      # newSecretManagerServices() — secret, folder, import
├── platform_handlers.go           # newPlatformHandlers()
├── secretmanager_handlers.go      # newSecretManagerHandlers()
├── platform/<handler>/            # Handler implementations
└── secretmanager/<handler>/       # Handler implementations
```

Initialize as local variables first, then assign to struct fields.

### Handler Package Structure

```
server/api/<product>/<handler>/
├── models.go      # ALL request/response types + Schema() methods (incl. shared types)
├── <endpoint>.go  # One handler method per file (list_secrets.go, get_secret.go, ...)
├── routes.go      # RegisterRoutes(router, app, handler)
└── <name>.go      # Handler struct + NewHandler()
```

### Handler Pattern

Uses the `chita` framework with typed request/response structs:

```go
// models.go
type ListSecretsRequest struct {
    ProjectID    string                 `json:"-"`
    Environment  string                 `json:"-"`
    SecretPath   chita.Optional[string] `json:"-"`  // Optional field with presence tracking
    Recursive    chita.Optional[bool]   `json:"-"`
}

func (r *ListSecretsRequest) Schema() *chita.ObjectSchema {
    return chita.Object(map[string]chita.Schema{
        "projectId":   chita.Str(&r.ProjectID).From(chita.SourceQuery).Required(),
        "environment": chita.Str(&r.Environment).From(chita.SourceQuery).Required(),
        "secretPath":  chita.OptStr(&r.SecretPath).From(chita.SourceQuery).Default("/"),
        "recursive":   chita.OptBool(&r.Recursive).From(chita.SourceQuery).Default(false),
    })
}

type ListSecretsResponse struct {
    chita.StatusOK
    Secrets []*SecretRaw `json:"secrets"`
}

func (r *ListSecretsResponse) Schema() *chita.ObjectSchema {
    return chita.Object(map[string]chita.Schema{
        "secrets": chita.Array((&SecretRaw{}).Schema()).Required(),
    })
}

// list_secrets.go
func (h *Handler) ListSecrets(ctx context.Context, req *ListSecretsRequest) (ListSecretsResponse, error) {
    path := req.SecretPath.ValueOr("/")  // Use default if not provided
    // ...
    return ListSecretsResponse{Secrets: secrets}, nil
}

// routes.go
func RegisterRoutes(router *chita.Router, app *chita.App, handler *Handler) {
    router.Route("/api/v4/secrets", func(r *chita.Router) {
        r.WithTags("Secrets")
        r.GET("/", chita.Handler(app, handler.ListSecrets).
            Summary("List secrets").
            OperationID("listSecretsV4"))
    })
}
```

**Schema helpers**:
- Required: `chita.Str(&field)`, `chita.Bool(&field)`, `chita.Int(&field)`
- Optional: `chita.OptStr(&field)`, `chita.OptBool(&field)`, `chita.OptInt(&field)` — binds to `chita.Optional[T]`
- Sources: `.From(chita.SourcePath)`, `.From(chita.SourceQuery)`, `.From(chita.SourceHeader)`, body is default
- Modifiers: `.Required()`, `.Default(val)`, `.Description("...")`, `.Optional()`

**`chita.Optional[T]`**: distinguishes "not provided" from "provided as zero value". Use `.IsSet()` to check presence, `.Value()` for the value (panics if unset), `.ValueOr(default)` for safe access.

### Handler vs Service Responsibilities

**Handlers** (`server/api/`) — thin orchestration:
1. Extract identity from context
2. Resolve permissions + IDs (e.g., project ID from slug) via shared services
3. Call domain service with opts (including `AccessChecker` for permission filtering)
4. Build API response + audit logs

**Services** (`services/`) — domain logic: data fetching/aggregation, decryption/encryption, business rules (import chaining, secret expansion, personal overrides), and permission filtering via `AccessChecker` in opts.

**AccessChecker pattern**: services accept an optional `AccessChecker` interface in opts. Pass `nil` to skip permission checks (internal/integration use). Permission logic stays in handlers; services enforce it.

### Permission Checker Pattern

Permission checks use `gocasl`. Instead of calling `gocasl.Can()` directly in handlers/services, wrap each domain's checks in a dedicated checker type under `services/permission/<product>/`:

```go
// services/permission/project/secret_permission.go
type SecretAccessChecker struct {
    ability *gocasl.Ability
}

func NewSecretAccessChecker(ability *gocasl.Ability) *SecretAccessChecker {
    return &SecretAccessChecker{ability: ability}
}

func (c *SecretAccessChecker) CanReadSecretValue(env, path, key string, tags []string) bool {
    return gocasl.Can(c.ability, project.SecretActionReadValue, project.SecretSubject{
        Environment: env, SecretPath: path, SecretName: key, SecretTags: tags,
    })
}
```

Usage:

```go
permResult, _ := permissionSvc.GetProjectPermission(ctx, args)
checker := project.NewSecretAccessChecker(permResult.Permission.Ability)
if !checker.CanReadSecretValue(env, path, key, tags) {
    return errutil.Forbidden("Cannot read secret")
}
```

**Why**: keeps subject construction and action selection in one place per domain, makes checkers easy to mock in tests, and prevents handler/service code from depending on `gocasl` directly. Existing checkers: `SecretAccessChecker`, `AssumePrivilegeChecker`.

Actions and subjects live in `services/permission/project/{actions.go,subjects.go}`:
- `gocasl.DefineAction[SubjectType]("verb")` — typed action constants
- Subject structs implement `SubjectType() string` and `GetField(string) any` so CASL can match field-conditional rules

**Database access**: services receive `pg.DB` and execute raw pgx queries via helper packages. Use `db.Primary()` for writes, `db.Replica()` for reads.

### Query Helpers

**`qb`** — dynamic SQL builders:

```go
// WHERE (named args)
args := pgx.NamedArgs{"folderID": folderID}
where := qb.NewWhere().
    Add("folder_id = @folderID").
    AddIf(len(keys) > 0, "key = ANY(@keys)")
args["keys"] = keys
rows, _ := db.Replica().Query(ctx, `SELECT * FROM secrets WHERE `+where.String(), args)

// INSERT / UPDATE / DELETE
sql, args := qb.Insert("secrets", "id", "key", "folder_id").
    Values(id1, key1, folder1).Values(id2, key2, folder2).Returning("*").Build()
sql, args := qb.Update("secrets").Set("key", newKey).Where("id = @id", "id", id).Returning("*").Build()
sql, args := qb.Delete("secrets").Where("id = @id", "id", id).Build()
```

**`sqln`** — flatten LEFT JOIN rows into nested structs:

```go
secrets := sqln.GroupRows(flatSecrets, sqln.Grouper[Secret, uuid.UUID]{
    Key:   func(s *Secret) uuid.UUID { return s.ID },
    Merge: func(existing, row *Secret) {
        if len(row.Tags) > 0 {
            existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0],
                func(t Tag) uuid.UUID { return t.ID })
        }
    },
})
```

**`pglock`** — PostgreSQL advisory locks:

```go
tx, _ := db.Primary().Begin(ctx)
lock, err := pglock.AcquireBlockingLock(ctx, tx, "my_lock_id")
if err != nil { tx.Rollback(ctx); return err }
defer lock.Rollback(ctx)  // safety net
// ... work ...
lock.Release(ctx)         // commits
```

### Writing Raw Queries

Use `pgx.NamedArgs`. Table aliases should be readable abbreviations (`memberships m`, `membership_roles mr`, `additional_privileges ap`) — never single letters.

```go
rows, _ := db.Replica().Query(ctx, `
    SELECT id, key, encrypted_value
    FROM secrets_v2
    WHERE folder_id = @folderID AND user_id IS NULL
    ORDER BY key ASC
`, pgx.NamedArgs{"folderID": folderID})
secrets, _ := pgx.CollectRows(rows, pgx.RowToStructByName[Secret])
```

## Wiring a New Feature

1. Service in `services/<product>/<name>/` with interface-based deps.
2. Handler in `server/api/<product>/<name>/`:
   - `models.go`, `<handler>.go`, one file per endpoint, `routes.go`.
3. If new permission checks are needed: add action constants in `services/permission/<product>/actions.go`, subject struct in `subjects.go`, and a checker in `<domain>_permission.go`.
4. Register service in `server/api/<product>_services.go`, handler in `<product>_handlers.go`, routes in `server/routes.go`.
5. `make test && make lint`.
