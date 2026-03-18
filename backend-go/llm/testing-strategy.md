# Backend-Go Testing

## Commands

```
make test          (testcontainers, race detector, 300s timeout)
```

## Infrastructure

Tests use `docker-compose.test.yml` via testcontainers-go. Stack: PostgreSQL 14, Redis 7, Node.js backend (handles migrations + seed APIs).

**Shared infra pattern:** First test package to run acquires a file lock (`.test-infra.lock`), starts compose, bootstraps credentials, and writes state to `.test-infra-state.json`. Subsequent packages reuse the running stack. Only `make test-cleanup` tears down containers.

## Test File Structure

Each API-facing service gets a `_test.go` in its package:

```
services/<product>/<domain>/<domain>_test.go
```

### TestMain (once per package)

```go
var (
    infra   *testutil.TestInfra
    project *testutil.ProjectSeed
)

func TestMain(m *testing.M) {
    infra = testutil.SetupInfra()               // start/reuse compose stack
    project = infra.MustCreateProject("my-svc")  // isolated project via Node.js API
    code := m.Run()
    infra.Teardown()                             // closes DB pool only
    os.Exit(code)
}
```

### setupMux (per test helper)

Wires the Goa module under test onto `testutil.TestMux` (httptest, no full server):

```go
func setupMux(t *testing.T) *testutil.TestMux {
    t.Helper()
    // Instantiate real shared services + DALs
    permDAL := permission.NewDAL()
    permSvc := permission.NewSharedService(permDAL)
    // Create the service under test
    svc := mysvc.NewService(testutil.NopLogger(), permSvc)
    // Mount Goa module
    mux := testutil.NewTestMux()
    endpoints := genmysvc.NewEndpoints(svc)
    server := mysvcsvr.New(endpoints, mux.Mux, mux.Dec, mux.Enc, mux.Eh, nil)
    mysvcsvr.Mount(mux.Mux, server)
    return mux
}
```

### Test functions

Fluent request builder → assert status → parse JSON:

```go
func TestCreateThing(t *testing.T) {
    mux := setupMux(t)

    var result map[string]any
    mux.Request(t, http.MethodPost, "/api/v1/my-endpoint").
        WithAuth(infra.IdentityToken).
        WithBody(map[string]any{"key": "value", "projectId": project.ID}).
        Do().
        ExpectStatus(http.StatusCreated).
        ParseJSON(&result)

    require.Equal(t, "expected", result["key"])
}
```

## Test Utilities (`internal/testutil/`)

| File | Purpose |
|------|---------|
| `infra.go` | `SetupInfra()` — compose lifecycle, file-lock coordination, DB pool, bootstrap credentials |
| `seed.go` | `MustCreateProject()`, `CreateProject()`, `DeleteProject()` — project seeding via Node.js API |
| `goahelper.go` | `TestMux`, `RequestBuilder`, `Response` — fluent HTTP testing for Goa modules |
| `logger.go` | `NopLogger()` — discarding slog logger |

## Key Tokens from TestInfra

- `infra.IdentityToken` — machine identity access token (for API auth)
- `infra.UserToken` — user JWT
- `project.ID`, `project.EnvSlug` — isolated project per test package

## Unit Tests

No special setup needed. Use for pure logic (crypto, validation, permission evaluation). No build tags — `make test-unit` runs all tests but skips integration since compose won't be available.
