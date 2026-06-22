# Secrets Endpoint Test Organization

This document describes the test structure for the secrets API endpoints (`/api/v4/secrets` and `/api/v4/secrets/{secretName}`).

## File Structure

File names mirror the API operation (`list_secrets_*`, `get_secret_by_name_*`).

```
tests/secrets/secrets/
├── main_test.go                          # TestMain, stack init, goleak
├── helpers_test.go                       # newSecretsHandler/Router + endpoint helpers
│
│ # ListSecrets Endpoint
├── list_secrets_basic_test.go            # Core functionality, query options, validation
├── list_secrets_expansion_test.go        # Reference expansion and imports
├── list_secrets_permission_test.go       # RBAC (roles, groups, privileges)
├── list_secrets_cache_test.go            # ETag and Redis caching
│
│ # GetSecretByName Endpoint
├── get_secret_by_name_basic_test.go      # Core functionality, validation
├── get_secret_by_name_expansion_test.go  # Reference expansion and imports
├── get_secret_by_name_permission_test.go # RBAC (import permission)
│
│ # Shared
├── v3_test.go                            # V3 API backward compatibility
└── service_token_test.go                 # Service token authentication (TODO)
```

Helper surface in `helpers_test.go`:
- `newSecretsHandler(t)` / `newSecretsRouter(t)` — wire the handler/router.
- `listSecrets`, `getSecret`, `listSecretsV3`, `getSecretV3` — take an `*infra.HTTPClient`
  and a generated `*secret.<Op>Query`, encode it via `Params`, and decode into the
  generated response type. The client is built inline per test; pointers via `new(...)`.
- `findSecret(secrets, key)` — locate a secret in a list response.

---

## Migration Checklist (Done)

### Build Correctness
- [x] **Delete `setup.go`** — its needed helpers moved to `helpers_test.go`; deprecated rest dropped.
- [x] **Single `newSecretsRouter`** — one definition in `helpers_test.go`.
- [x] Every file carries `//go:build integration` and uses `package secrets_test`.

### Test Isolation & Parallelism
- [x] **No shared mutable fixtures** — `testProject` removed from `TestMain`; each test creates its own project.
- [x] Tests are independently runnable.
- [x] **`t.Parallel()`** on tests that create their own project. (`TestListSecrets_SoftDeletedEnvironment` is intentionally sequential — it asserts before/after a soft delete on one env.)

### Leak Detection
- [x] `TestMain` runs `goleak.Find` after `m.Run()`, ignoring the Redis pool reaper. (`goleak` was already in `go.sum`; promoted to `go.mod`.)

### Helpers Cleanup
- [x] Deprecated helpers dropped (`newTestServer`, `doGet`, `httpListSecretsV4`, `readAll`, `parseErrorResponse`, `new[T]` shadow).
- [x] Requests go through `infra.HTTPClient` (built inline) + the typed endpoint helpers. Negative/raw cases use `Param`/`Header`/`Do`/`ExpectStatus`.
- [x] `TestListSecretsV4_HTTP` / `TestGetSecretByNameV4_HTTP` folded into the `*_basic` validation tables.

### Naming Migration
- [x] All tests renamed to `Test<Endpoint>_<Feature>_<Scenario>`.

### Docs Drift
- [ ] Fix CLAUDE.md references: `tests/secretmanager/secrets/` -> `tests/secrets/secrets/` (root + backend-go CLAUDE.md — **still open**).

---

## File Breakdown

### Setup Files

#### `main_test.go`
TestMain only. Initializes the test stack (Postgres, Redis, Node.js API).

```go
var stack *infra.Stack

func TestMain(m *testing.M) {
    stack = infra.New().
        WithPostgres().
        WithRedis().
        WithNodeJSApi().
        WithEEFeatures("rbac", "groups").
        MustStart()

    code := m.Run()
    stack.Stop()

    // Check for goroutine leaks only if tests passed
    if code == 0 {
        if err := goleak.Find(
            goleak.IgnoreTopFunction("github.com/redis/go-redis/v9/internal/pool.(*ConnPool).reaper"),
        ); err != nil {
            fmt.Fprintf(os.Stderr, "goleak: %v\n", err)
            os.Exit(1)
        }
    }

    os.Exit(code)
}
```

**Important:** No shared mutable fixtures (like `testProject`). Each test creates its own data.

#### `helpers_test.go`
Shared test infrastructure. Migrated from `setup.go` (which is deleted).

Contains:
- `newSecretsHandler(t)` - creates handler with all dependencies
- `newSecretsRouter(t)` - creates HTTP router (single definition)
- Param structs: `ListSecretsV4Params`, `GetSecretByNameV4Params`, etc.
- `ptr[T](v T) *T` helper for optional params

**Does NOT contain:**
- Deprecated helpers (`newTestServer`, `doGet`, `httpListSecretsV4`, `readAll`, `parseErrorResponse`)
- `new[T]` - shadows builtin, use `ptr[T]` instead

---

### ListSecrets Endpoint

#### `list_basic_test.go`
Core list functionality and query options.

| Test Area | What to Test |
|-----------|--------------|
| Structure | Response fields, required vs optional, types |
| Decryption | Secret values are decrypted correctly |
| Comments | `secretComment` field populated |
| Reminders | `secretReminderNote`, `secretReminderRepeatDays` |
| Metadata | `secretMetadata` array, encrypted vs plaintext |
| Tags | `tags` array with id, slug, name, color |
| Path | `secretPath` parameter filters correctly |
| Recursive | `recursive=true` includes subfolders |
| Tag Filter | `tagSlugs` parameter filters by tags |
| Metadata Filter | `metadataFilter` parameter filters by metadata |
| Personal Overrides | `includePersonalOverrides` for users vs identities |
| Soft-Deleted Env | Deleted environments return not found |
| Stable Ordering | Results ordered by key ASC |
| Errors | Environment not found, folder not found, invalid params |
| HTTP Validation | Missing required params return 400 (folded from HTTP tests) |

#### `list_expansion_test.go`
Secret reference expansion and imports.

| Test Area | What to Test |
|-----------|--------------|
| Same-Folder Refs | `${SECRET}` expands from same folder |
| Nested Refs | `${A}` -> `${B}` -> value chains |
| Cross-Env Refs | `${env.SECRET}` syntax |
| Cross-Path Refs | `${env.path.SECRET}` syntax |
| No Expansion | `expandSecretReferences=false` preserves `${...}` |
| Include Imports | `includeImports=true` returns imported secrets |
| Exclude Imports | `includeImports=false` omits imports |
| Import Priority | Later imports override earlier ones |
| Import Chains | A imports B imports C (deep chains) |
| Circular Imports | Circular import detection/handling |
| Expansion + Imports | References resolved from imported secrets |
| Missing Refs | Unresolved `${MISSING}` behavior |
| Self-Reference | `${SECRET}` referencing itself |

#### `list_permission_test.go`
Role-based access control for list endpoint.

| Test Area | What to Test |
|-----------|--------------|
| Identity Roles | admin, member, viewer, no-access |
| Identity Not Member | Returns forbidden |
| User Roles | admin, viewer via direct membership |
| Custom Roles | Environment-scoped, path-scoped permissions |
| Group Membership | User inherits group's project role |
| Group Custom Role | User inherits group's custom role |
| Additional Privileges | Extends base role permissions |
| Multiple Privileges | Multiple privileges merge correctly |
| Temporary Roles | Active grants access, expired denies |
| Temporary Privileges | Active vs expired additional privileges |
| ViewSecretValue | `false` masks values, `true` shows values |

#### `list_cache_test.go`
ETag and Redis caching behavior.

**Important:** Tests that verify handler-level caching (e.g., `Returns304FromHandlerCache`) must build **one** handler/router and reuse it across requests. Do not call `newSecretsRouter(t)` per request. Per-test `kms.Start()` is expensive.

| Test Area | What to Test |
|-----------|--------------|
| ETag Header | Response includes `ETag` header |
| 304 Response | Matching `If-None-Match` returns 304 |
| 200 on Mismatch | Non-matching ETag returns full response |
| ETag Consistency | Same request produces same ETag |
| ETag Varies | Different params produce different ETags |
| Redis Storage | Cache entries stored in Redis |
| Actor Isolation | Different actors have separate caches |
| Cache Invalidation | Secret changes invalidate cache |

```go
// Correct: single handler, multiple requests
func TestListSecrets_Cache_Returns304(t *testing.T) {
    nodejs := stack.NodeJS()
    proj := nodejs.CreateProject(t, "cache-test")
    // ...
    
    router := newSecretsRouter(t)  // One router
    client := infra.NewClientBuilder(t, router).
        Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
        Build()
    
    // First request
    body1, status1, headers1 := client.Get("/api/v4/secrets").
        Param("projectId", proj.ID).
        Param("environment", proj.EnvSlug).
        Do()
    
    etag := headers1.Get("ETag")
    
    // Second request with If-None-Match
    body2, status2, _ := client.Get("/api/v4/secrets").
        Param("projectId", proj.ID).
        Param("environment", proj.EnvSlug).
        Header("If-None-Match", etag).
        Do()
    
    assert.Equal(t, 304, status2)
}
```

---

### GetSecretByName Endpoint

#### `get_basic_test.go`
Core get functionality.

| Test Area | What to Test |
|-----------|--------------|
| Structure | Response fields match schema |
| Decryption | Secret value decrypted correctly |
| Not Found | Missing secret returns 404 |
| Comments | `secretComment` field |
| Reminders | `secretReminderNote`, `secretReminderRepeatDays` |
| Metadata | `secretMetadata` array |
| Tags | `tags` array with color |
| Version | `version` parameter retrieves specific version |
| Version Not Found | Invalid version returns error |
| Type Shared | `type=shared` returns shared secret |
| Type Personal | `type=personal` returns personal override |
| Secret Path | `secretPath` parameter |
| Errors | Invalid params, environment not found |
| HTTP Validation | Missing required params return 400 (folded from HTTP tests) |

#### `get_expansion_test.go`
Reference expansion and imports for single secret.

| Test Area | What to Test |
|-----------|--------------|
| Same-Folder Refs | Expands without imports configured |
| Nested Refs | Multi-level expansion |
| Cross-Env Refs | `${env.SECRET}` syntax |
| No Expansion | `expandSecretReferences=false` |
| From Import | Secret found via import |
| Import Excluded | `includeImports=false` returns not found |
| Import Source Env | Response shows actual source environment |
| Missing Refs | Partial expansion behavior |

#### `get_permission_test.go`
Role-based access control for get endpoint.

| Test Area | What to Test |
|-----------|--------------|
| Direct Secret | Allowed with matching permissions |
| Import Permission | Requires permission on source environment |
| Import Denied | No source env permission returns error |
| ViewSecretValue | Masks value when false |

---

### Shared Files

#### `v3_test.go`
V3 API backward compatibility (deprecated endpoints).

| Test Area | What to Test |
|-----------|--------------|
| List with workspaceSlug | `/api/v3/secrets/raw?workspaceSlug=...` |
| List with workspaceId | `/api/v3/secrets/raw?workspaceId=...` |
| List requires workspace | Error without workspaceId or workspaceSlug |
| List include_imports | `include_imports` param (underscore) |
| Get with workspaceSlug | `/api/v3/secrets/raw/{name}?workspaceSlug=...` |
| Get with workspaceId | `/api/v3/secrets/raw/{name}?workspaceId=...` |

#### `service_token_test.go`
Service token authentication for both endpoints.

| Test Area | What to Test |
|-----------|--------------|
| **List Endpoint** | |
| Within Scope | Token with matching env/path can list |
| Outside Env Scope | Token cannot list other environments |
| Outside Path Scope | Token cannot list other paths |
| Read-Only Scope | Token with read scope can list |
| Expired Token | Expired token returns 401 |
| **Get Endpoint** | |
| Within Scope | Token can get secret in scope |
| Outside Scope | Token cannot get secret outside scope |
| From Import | Token needs scope on source environment |

---

## Adding New Tests

### Which file?

1. **Is it about caching?** -> `list_secrets_cache_test.go`
2. **Is it about V3 compatibility?** -> `v3_test.go`
3. **Is it about service tokens?** -> `service_token_test.go`
4. **Is it about permissions/RBAC?** -> `*_permission_test.go`
5. **Is it about expansion or imports?** -> `*_expansion_test.go`
6. **Is it core functionality or validation?** -> `*_basic_test.go`

The expansion *algorithm* (circular refs, self-reference, max depth, chained
absolute refs, import ordering) lives in the unit suite
`internal/services/secrets/secret/expansion_test.go`. Integration `*_expansion_test.go`
only covers the end-to-end wiring (expansion/imports through the real handler, DB,
and permissions). Do not duplicate the algorithm matrix here.

### Naming Convention

Applies to **all** tests (new and existing):

```
Test<Endpoint>_<Feature>_<Scenario>

// Examples:
TestListSecrets_Basic_ReturnsCorrectStructure
TestListSecrets_Recursive_IncludesSubfolders
TestListSecrets_Expansion_NestedRefs
TestListSecrets_Permission_IdentityAdminReadsAll
TestListSecrets_Permission_TemporaryRoleExpired
TestGetSecretByName_Version_ReturnsSpecificVersion
TestGetSecretByName_Expansion_CrossEnvRef
TestServiceToken_List_OutsideEnvScope
TestV3_List_WithWorkspaceSlug
```

### Test Structure

Each test creates its own isolated data. No shared fixtures. **Tests can run in parallel.**

```go
func TestListSecrets_Basic_ReturnsCorrectStructure(t *testing.T) {
    t.Parallel()  // Safe because each test has its own project
    
    nodejs := stack.NodeJS()
    
    // Each test creates its own project - no shared state
    proj := nodejs.CreateProject(t, "structure-test")
    nodejs.CreateSecret(t, proj.ID, proj.EnvSlug, "/", "KEY", "value", nil)
    
    identity := nodejs.CreateIdentity(t, "structure-identity")
    nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))
    
    // Use ClientBuilder - the only request path
    client := infra.NewClientBuilder(t, newSecretsRouter(t)).
        Identity(infra.MachineIdentity(identity.ID, nodejs.OrgID())).
        Build()
    
    // Act
    var resp secret.ListSecretsV4Response
    client.Get("/api/v4/secrets").
        Param("projectId", proj.ID).
        Param("environment", proj.EnvSlug).
        MustInto(&resp)
    
    // Assert
    require.Len(t, resp.Secrets, 1)
    assert.Equal(t, "KEY", resp.Secrets[0].SecretKey)
}
```

### Parallel Execution

Tests are safe to run in parallel when they create their own isolated project:

```go
// Top-level tests: use t.Parallel()
func TestListSecrets_Expansion_NestedRefs(t *testing.T) {
    t.Parallel()
    // ...
}

// Table-driven subtests: each subtest can also be parallel
func TestListSecrets_Permission_Roles(t *testing.T) {
    t.Parallel()
    
    tests := []struct {
        name string
        role string
        // ...
    }{
        {name: "admin can read", role: "admin"},
        {name: "viewer can read", role: "viewer"},
    }
    
    for _, tc := range tests {
        t.Run(tc.name, func(t *testing.T) {
            t.Parallel()  // Subtests run in parallel too
            
            nodejs := stack.NodeJS()
            proj := nodejs.CreateProject(t, "role-"+tc.role)
            // ...
        })
    }
}
```

**When NOT to use `t.Parallel()`:**
- Cache tests that verify handler-level state across requests (need sequential requests to same handler)
- Tests that intentionally share state for a specific reason (should be rare)
```

---

## Gaps — Status

### Implemented
- [x] Service token scope tests — `service_token_test.go` (`TestServiceToken_ListSecrets_Scope`, `TestServiceToken_GetSecretByName_Scope`).
- [x] Secret versioning via the `version` query param — `TestGetSecretByName_Version`.
- [x] Stable ordering (`ORDER BY key ASC`) — `TestListSecrets_StableOrdering`.
- [x] `skipMultilineEncoding` field — `TestGetSecretByName_ResponseFields` (infra `CreateSecretOpts.SkipMultilineEncoding` added).
- [x] `actor` field in response — `TestGetSecretByName_ResponseFields`.
- [x] `isRotatedSecret` / `rotationId` for a normal (non-rotated) secret — `TestGetSecretByName_ResponseFields`.
- [x] Error boundary: invalid project id — `TestListSecrets_InvalidProjectID`. Missing-required-param 400 — `*_basic` validation tables.
- [x] Cache concurrency under `-race` — `TestListSecrets_Cache_ConcurrentAccess` (plus `TestListSecrets_Cache_IsolatedByActor`).
- [x] HTTP Content-Type — `TestListSecrets_ContentType`.
- [x] Large response — `TestListSecrets_LargeResponse`.

### Covered by the unit suite (not duplicated in integration)
- [x] Expansion edge cases (circular refs, self-reference) — `expansion_test.go` (`TestExpand_CircularReference_*`).
- [x] Import chains (deep chains, ordering) — `expansion_test.go` (`TestExpand_ImportOrder_NestedImportOrder`, etc.).

### Blocked / out of scope
- Rotated-secret response (`isRotatedSecret = true`, populated `rotationId`) — needs secret-rotation test infra; only the non-rotated contract is asserted today.
- Malformed-filter error boundary (e.g. bad `metadataFilter`) — behavior (reject vs ignore) unverified; left out to avoid a guessed assertion.
- Service-token expiry → 401 — enforced by the auth middleware, which these handler tests bypass; covered by auth tests.

### Not Applicable
- Pagination tests: `ListSecretsV4Query` has no limit/offset/orderBy params.
