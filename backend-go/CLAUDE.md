# backend-go

Partial Go rewrite of the Node.js backend using Goa v3 + raw pgx queries.

## Commands

```
make build      # build binary
make dev        # hot-reload via docker-compose + air
make gen-goa    # regenerate Goa handlers (design/ → gen/)
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
- **No DAL layer**: Services directly use `pg.DB` and execute raw pgx queries.
- **Error wrapping**: Wrap database errors at service level with context:
  ```go
  errutil.DatabaseErr("Failed to load").WithErrf("FuncName(arg=%s): %w", arg, err)
  errutil.Forbidden("Access denied").WithErrf("FuncName: permission check failed")
  ```
- **Lean code**: Inline single-use helpers.
- **Test naming**: Follow `Test<FunctionName>_<Scenario>` pattern. Examples:
  - `TestSymmetricEncrypt_RoundTrip`
  - `TestGetSecrets_FilterByTags`
  - `TestStart_Success`

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
│   ├── design/                 # Goa DSL definitions
│   ├── gen/                    # Goa generated (DO NOT EDIT)
│   ├── api/                    # Endpoint implementations + DI wiring
│   └── middlewares/            # HTTP middlewares (httpinfo, etc.)
├── services/                   # Shared business logic (auth, permission, kms)
├── keystore/                   # Redis key-value operations
└── testutil/                   # Test infra (testcontainers)
```

**Two tiers:**

- `server/api/` — Goa endpoint implementations. 1:1 with endpoints. Not imported elsewhere.
- `services/` — Shared logic. No Goa dependency. Directly uses `pg.DB` for queries.

**Database access**: Services receive `pg.DB` and execute raw pgx queries using helper packages.

**Read replicas**: `pg.DB` wraps primary + replica pools. Use `db.Primary()` for writes, `db.Replica()` for reads.

### Query Helpers

**`qb` package** — Query builders for dynamic SQL:

```go
// WHERE builder (for SELECT with named args)
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

**`sqln` package** — Transform flat LEFT JOIN rows into nested structs:

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

**Table aliases**: Use clear, readable aliases — not single letters. For example, `memberships m`, `membership_roles mr`, `organizations o`, `additional_privileges ap`. Aliases should be obvious abbreviations of the table name.

Scan rows using `pgx.CollectRows` or manual scanning:

```go
secrets, err := pgx.CollectRows(rows, pgx.RowToStructByName[Secret])
```

## Wiring a New Feature

1. Define API in Goa DSL (`server/design/<product>/`)
2. `make gen-goa`
3. Implement in `server/api/<product>/<name>/`
4. Wire in `api.go`
5. Add tests, run `make test && make lint`, auto fix lint command `make lint-fix`
