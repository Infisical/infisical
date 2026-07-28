# backend-go

Partial Go rewrite of the Node.js backend using chi + oapi-codegen + raw pgx queries.

## Commands

```
make build            # build binary
make dev              # hot-reload via docker-compose + air
make test             # run all tests (unit + integration)
make test-unit        # unit tests only (./internal/...)
make test-integration # integration tests only (./tests/..., testcontainers)
make test-hsm         # HSM tests (requires Docker, builds test container)
make lint             # must pass before submission
make lint-fix         # auto-fix linting issues
make generate         # run go generate ./... for oapi-codegen
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
├── libs/                       # crypto, errutil, fn, logutil, cache, jitter, requestid
├── server/
│   ├── api/                    # Endpoint implementations + DI wiring
│   │   ├── shared/             # Shared types (Error, ValidationError) + ErrorHandler
│   │   ├── platform/           # Platform handlers (projects, etc.)
│   │   └── secretmanager/      # Secret manager handlers
│   └── middlewares/            # HTTP middlewares (RequireAuth, etc.)
├── services/                   # Shared business logic (auth, permission, kms, ...)
└── keystore/                   # Redis key-value operations
tests/                          # Integration tests (external test packages)
├── infra/                      # Test infrastructure (testcontainers, HTTP client)
│   └── nodejs/                 # Node.js backend seed facade (svc.For(t), domain builders)
├── platform/                   # Platform service tests
│   ├── auth/                   # Authentication handler tests
│   ├── externalkms/            # External KMS (AWS/GCP) tests
│   ├── hsm/                    # HSM tests (container-based)
│   ├── kms/                    # KMS service tests
│   ├── permission/             # Permission system tests
│   ├── projects/               # Projects handler tests
│   └── ratelimit/              # Rate limiting tests
└── secrets/
    └── secrets/                # Secrets API tests (list, get, permissions, cache, v3, service token)
```

**Test seed data**: create projects/identities/secrets/etc. via the `tests/infra/nodejs`
facade — `api := stack.NodeJS().For(t)`, then domain builders like
`api.Secrets.Create(projectID, env, key, value).Comment("...").Do()`. Parameterized
endpoints are builders (required args in the constructor, optional setters, terminal
`Do()`) so new params don't break call sites. Each domain file co-locates its request/
response models with its endpoints. The `nodejs` package imports nothing from `infra`
(infra wires it via `nodejs.Start`/`Bootstrap`/`AttachDB`), keeping the dependency acyclic.

**Two tiers:**
- `server/api/` — DI wiring + endpoint implementations. Handlers 1:1 with endpoints.
- `services/` — Business logic, uses `pg.DB` directly.

### Wiring (Composition Root)

All service/handler initialization lives in `server/api/`:

```
server/api/
├── api.go                         # Infra, Registry, NewRegistry()
├── platform_services.go           # newPlatformServices() — kms, auth, permission, etc.
├── secretmanager_services.go      # newSecretManagerServices() — secret, folder, import
├── platform_routes.go             # RegisterPlatformRoutes() — chi routing
├── secretmanager_routes.go        # RegisterSecretManagerRoutes() — chi routing
├── shared/                        # Shared types + error handler
├── platform/<handler>/            # Handler implementations
└── secretmanager/<handler>/       # Handler implementations
```

Initialize as local variables first, then assign to struct fields.

### Handler Package Structure

Each handler package is generated from an OpenAPI spec using `oapi-codegen`:

```
server/api/<product>/<handler>/
├── openapi.yml    # OpenAPI 3.0 spec (source of truth)
├── cfg.yaml       # oapi-codegen config
├── gen.go         # GENERATED types, HTTPAdapter, ServiceInterface
├── <name>.go      # Handler struct + NewHandler() + //go:generate directive
└── <endpoint>.go  # One handler method per file (list_secrets.go, get_secret.go, ...)
```

### Handler Pattern

Uses `oapi-codegen` (DoorDash fork) to generate types and HTTP adapters from OpenAPI specs:

**`openapi.yml`** — OpenAPI 3.0 source of truth:
```yaml
paths:
  /api/v4/secrets:
    get:
      operationId: ListSecretsV4
      summary: List secrets
      parameters:
        - name: projectId
          in: query
          required: true
          schema:
            type: string
        - name: environment
          in: query
          required: true
          schema:
            type: string
        - name: secretPath
          in: query
          schema:
            type: string
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ListSecretsV4Response'
```

**`<handler>.go`** — Handler implements generated `ServiceInterface`:
```go
//go:generate go tool oapi-codegen -config cfg.yaml openapi.yml

package secret

var _ ServiceInterface = (*Handler)(nil)

type Handler struct {
    logger     *slog.Logger
    permission PermissionService
    secrets    SecretsService
}

func NewHandler(deps *Deps) *Handler {
    return &Handler{...}
}

// ListSecretsV4 implements ServiceInterface
func (h *Handler) ListSecretsV4(ctx context.Context, opts *ListSecretsV4ServiceRequestOptions) (*ListSecretsV4ResponseData, error) {
    q := opts.Query
    secretPath := fn.ValueOr(q.SecretPath, "/")  // Use helper for optional fields
    
    // ... business logic ...
    
    return NewListSecretsV4ResponseData(&ListSecretsV4Response{
        Secrets: secrets,
    }), nil
}
```

**Generated types:**
- Required fields: plain types (`string`, `int`, etc.)
- Optional fields: pointers (`*string`, `*int`, etc.)
- Use `fn.ValueOr(ptr, default)` for safe access with fallback
- Use `new(value)` to create pointers for optional fields (Go 1.26+)

**Route registration** (`<product>_routes.go`):
```go
func RegisterSecretManagerRoutes(router chi.Router, logger *slog.Logger, platform *PlatformServices, svc *SecretManagerServices) {
    secretsHandler := secret.NewHandler(&secret.Deps{...})
    secretsAdapter := secret.NewHTTPAdapter(secretsHandler, shared.NewErrorHandler(logger))

    router.Group(func(r chi.Router) {
        r.Use(middlewares.RequireAuth(
            platform.Authenticator,
            middlewares.JWTAuth,
            middlewares.IdentityAccessTokenAuth,
            middlewares.ServiceTokenAuth,
        ))
        r.Get("/api/v4/secrets", secretsAdapter.ListSecretsV4)
        r.Get("/api/v4/secrets/{secretName}", secretsAdapter.GetSecretByNameV4)
    })
}
```

### Auth Middleware

`RequireAuth` is a fail-closed middleware that validates bearer tokens:

```go
r.Use(middlewares.RequireAuth(
    authenticator,
    middlewares.JWTAuth,              // User session JWT
    middlewares.IdentityAccessTokenAuth,  // Machine identity token
    middlewares.ServiceTokenAuth,     // Service token
))
```

- No bearer header → 401
- Bearer present but mode not in allowed list → 401
- Validator returns error → 401
- Success: identity stored in context via `auth.WithIdentity()`

### Error Handling

`shared.ErrorHandler` translates errors to HTTP responses:
- `errutil.Error` → appropriate status + JSON body
- `runtime.ValidationErrors` → 400 with field errors
- Unknown errors → 500

All errors include request ID and are logged appropriately (warn for 4xx, error for 5xx).

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

1. **Service** in `services/<product>/<name>/` with interface-based deps.

2. **Handler** in `server/api/<product>/<name>/`:
   - Create `openapi.yml` with endpoints
   - Create `cfg.yaml` from template (see existing handlers)
   - Run `go generate ./...` to create `gen.go`
   - Create `<handler>.go` with `//go:generate` directive, `Handler` struct, `NewHandler()`
   - Implement `ServiceInterface` methods (one file per endpoint)

3. **Permission checks** (if needed): add action constants in `services/permission/<product>/actions.go`, subject struct in `subjects.go`, and a checker in `<domain>_permission.go`.

4. **Wire routes** in `server/api/<product>_routes.go`:
   - Create handler and HTTP adapter
   - Mount routes with appropriate auth middleware

5. **Register** service in `server/api/<product>_services.go`.

6. Run `make test && make lint`.
