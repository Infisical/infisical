# Testing Strategy for backend-go (100+ Services)

## Context

Porting the Node.js Infisical backend to Go. The Go modules need integration testing against real PostgreSQL with real data. Instead of duplicating migration/seed logic, we leverage the **existing Node.js backend container** as the infrastructure and seed layer — it handles migrations and exposes APIs to create orgs, projects, and tokens that the Go tests consume.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  TestMain (per package, go test -tags=integration)        │
│                                                           │
│  1. testcontainers-go starts docker-compose.test.yml:     │
│     - PostgreSQL (random mapped port)                     │
│     - Redis (random mapped port)                          │
│     - Node.js backend (random mapped port) ← migrations  │
│     Waits for all health checks to pass.                  │
│                                                           │
│  2. Call Node.js API to seed:                             │
│     - POST /api/v1/signup → create user                   │
│     - POST /api/v1/org → create org                       │
│     - POST /api/v1/workspace → create project             │
│     - Returns: orgId, projectId, authToken                │
│     - Each test package gets its OWN project (isolated)   │
│                                                           │
│  3. t.Cleanup → compose.Down() (automatic teardown)       │
└──────────────────┬───────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────┐
│  Per-Test (e.g. TestCreateSecret)                         │
│                                                           │
│  1. Wire the Goa module under test:                       │
│     endpoints → HTTP server → mux                         │
│     DALs connected to same PostgreSQL                     │
│                                                           │
│  2. Use seeded projectId + authToken                      │
│                                                           │
│  3. Send HTTP requests via httptest:                       │
│     POST /api/v1/secret-manager/secrets                   │
│     → assert status, JSON body, DB state                  │
└──────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Migrations | Node.js backend container handles them | Single source of truth, no duplication |
| Seed data | Created via Node.js API calls | Real auth tokens, real encrypted data, same flow as production |
| Test isolation | Per-suite project (each test file creates its own project via Node.js API) | No cross-test interference, no transaction hacks |
| Cleanup | testcontainers-go manages lifecycle (start in TestMain, teardown via t.Cleanup) | Fully self-contained, no manual docker commands |
| Go module testing | Goa module mounted on httptest mux | Tests full HTTP path without booting the entire Go server |
| DB connection | Go tests connect directly to the same PostgreSQL | DALs use the real DB, same as production |

---

## Phase 1: Docker Compose via testcontainers-go

### `backend-go/docker-compose.test.yml`

Compose file defining the test stack (consumed by testcontainers, not run manually):

```yaml
services:
  db:
    image: postgres:14-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_PASSWORD: infisical
      POSTGRES_USER: infisical
      POSTGRES_DB: infisical

  redis:
    image: redis
    ports:
      - "6379:6379"

  backend-nodejs:
    image: infisical/infisical:latest  # or build from ../backend
    depends_on:
      - db
      - redis
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=development
      - DB_CONNECTION_URI=postgres://infisical:infisical@db/infisical?sslmode=disable
      - REDIS_URL=redis://redis:6379
      - ENCRYPTION_KEY=a984ecdf82ec779e55dbcc21303a900f
      - AUTH_SECRET=test-auth-secret
      # ... minimal required env vars
```

### Lifecycle managed by testcontainers-go compose module

No Makefile targets for infra. The Go test code starts and stops everything:

```go
import tc "github.com/testcontainers/testcontainers-go/modules/compose"

compose, err := tc.NewDockerCompose("docker-compose.test.yml")
// Start all services
compose.Up(ctx)
// Wait for Node.js backend to be ready
compose.WaitForService("backend-nodejs", wait.ForHTTP("/api/status").WithPort("4000"))
// ... run tests ...
// Teardown
compose.Down(ctx)
```

This means `go test -tags=integration ./internal/...` is fully self-contained — no manual docker commands needed.

---

## Phase 2: Test Infrastructure (`internal/testutil/`)

### `internal/testutil/logger.go`

```go
func NopLogger() *slog.Logger {
    return slog.New(slog.NewTextHandler(io.Discard, nil))
}
```

### `internal/testutil/infra.go` — Global setup/teardown via testcontainers

Starts the compose stack from Go, waits for all services, returns connection details:

```go
type TestInfra struct {
    DBURI     string
    RedisURL  string
    NodeJSURL string         // http://localhost:<mapped-port>
    DB        *pgxpool.Pool
    compose   tc.ComposeStack // for teardown
}

// SetupInfra starts docker-compose.test.yml via testcontainers-go,
// waits for PostgreSQL, Redis, and Node.js backend to be healthy,
// creates a pgxpool connection, and returns a cleanup function.
func SetupInfra(t *testing.T) *TestInfra {
    compose, _ := tc.NewDockerCompose("../../docker-compose.test.yml")
    compose.
        WaitForService("db", wait.ForListeningPort("5432")).
        WaitForService("redis", wait.ForListeningPort("6379")).
        WaitForService("backend-nodejs", wait.ForHTTP("/api/status").WithPort("4000")).
        Up(ctx)

    t.Cleanup(func() { compose.Down(ctx) })

    // Get mapped ports, create DB pool, return TestInfra
    ...
}
```

Since testcontainers maps to random host ports, `TestInfra` discovers them dynamically — no port conflicts in CI.

### `internal/testutil/seed.go` — Seed via Node.js API

Calls the Node.js backend to create isolated test data per suite:

```go
type SeedData struct {
    OrgID     string
    ProjectID string
    EnvSlug   string
    AuthToken string  // JWT from Node.js login
}

// SeedProject calls the Node.js API to create a user, org, project,
// and environment. Returns credentials the Go test can use.
// Each call creates independent data — no cross-test interference.
func SeedProject(t *testing.T, nodeJSURL string) *SeedData { ... }
```

Internally this does:
1. `POST /api/v1/signup` — create test user (or login if exists)
2. `POST /api/v1/org` — create org
3. `POST /api/v1/workspace` — create project in that org
4. Return `{ orgID, projectID, envSlug, authToken }`

### `internal/testutil/goahelper.go` — Goa module test wiring

Helper to mount a single Goa module on a test mux:

```go
type TestMux struct {
    Mux goahttp.Muxer
}

func NewTestMux() *TestMux { ... }

// ServeHTTP sends a request and returns the response.
func (tm *TestMux) Do(method, path string, body any, headers map[string]string) *httptest.ResponseRecorder { ... }
```

---

## Phase 3: Pilot — Secrets Service Test

### `internal/services/secretmanager/secrets/secrets_integration_test.go`

```go
//go:build integration

package secrets_test

import (
    "os"
    "testing"
)

var infra *testutil.TestInfra
var seed  *testutil.SeedData

func TestMain(m *testing.M) {
    infra, cleanup := testutil.SetupInfra()
    defer cleanup()

    // Seed a project for this test suite via Node.js API
    seed = testutil.SeedProject(nil, infra.NodeJSURL)

    os.Exit(m.Run())
}

func TestCreateSecret(t *testing.T) {
    // Wire the Go secrets Goa module
    secretDAL := ormify.New[model.SecretsV2](infra.DB, infra.DB, secretsTableDef)
    permLib := permission.NewLib(permission.NewDAL())
    svc := secrets.NewService(testutil.NopLogger(), permLib, secretDAL)

    mux := testutil.NewTestMux()
    endpoints := gensecrets.NewEndpoints(svc)
    server := secretssvr.New(endpoints, mux.Mux, ...)
    secretssvr.Mount(mux.Mux, server)

    // Test: create a secret in the seeded project
    resp := mux.Do("POST", "/api/v1/secret-manager/secrets", map[string]any{
        "key":         "DB_PASSWORD",
        "value":       "s3cret",
        "environment": seed.EnvSlug,
        "projectId":   seed.ProjectID,
    }, map[string]string{
        "Authorization": "Bearer " + seed.AuthToken,
    })

    require.Equal(t, 201, resp.Code)
    // ... assert JSON body, then verify DB state via DAL
}

func TestListSecrets(t *testing.T) { ... }
func TestGetSecret(t *testing.T) { ... }
func TestUpdateSecret(t *testing.T) { ... }
func TestDeleteSecret(t *testing.T) { ... }
```

### `internal/services/platform/projects/projects_integration_test.go`

Same pattern for projects service.

---

## Phase 4: Scale to 100+ services

Every new service gets `_integration_test.go` following:

1. `TestMain` → `SetupInfra()` + `SeedProject()` (one project per test file)
2. Wire the Goa module under test with real DALs
3. Table-driven tests sending HTTP via `httptest`
4. Assert response + DB state
5. No cleanup needed — each suite has its own project

**Unit tests** (`_test.go` without build tag) only for:
- Pure computation (crypto, hashing)
- Complex validation logic
- Permission evaluation with many branches

---

## Makefile Targets

```makefile
# Run integration tests — testcontainers handles docker lifecycle automatically
test-integration:
	go test ./internal/... -tags=integration -count=1 -race -timeout 300s

# Run unit tests (no Docker needed)
test-unit:
	go test ./internal/... -count=1 -race
```

No `test-infra-up` / `test-infra-down` needed — testcontainers starts compose on first `TestMain`, containers are torn down via `t.Cleanup`.

---

## File Layout

```
backend-go/
├── docker-compose.test.yml              # PostgreSQL + Redis + Node.js (consumed by testcontainers)
├── Makefile                             # test-integration, test-unit
├── internal/
│   ├── testutil/
│   │   ├── infra.go                     # SetupInfra: testcontainers compose + DB pool
│   │   ├── seed.go                      # SeedProject: create org/project via Node.js API
│   │   ├── logger.go                    # NopLogger
│   │   └── goahelper.go                 # TestMux: mount Goa module + HTTP helper
│   ├── services/
│   │   ├── platform/projects/
│   │   │   ├── projects.go
│   │   │   └── projects_integration_test.go
│   │   └── secretmanager/secrets/
│   │       ├── secrets.go
│   │       └── secrets_integration_test.go
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `docker-compose.test.yml` | Test infrastructure definition |
| `internal/testutil/infra.go` | Global setup: ensure containers running, create DB pool |
| `internal/testutil/seed.go` | Seed data via Node.js API calls |
| `internal/testutil/logger.go` | NopLogger for tests |
| `internal/testutil/goahelper.go` | TestMux helper for Goa module testing |
| `internal/services/secretmanager/secrets/secrets_integration_test.go` | Pilot: secrets tests |
| `internal/services/platform/projects/projects_integration_test.go` | Pilot: projects tests |

**No changes to existing production code.**

## Verification

1. `make test-integration` — testcontainers starts compose (PostgreSQL + Redis + Node.js), waits for health, seeds data, runs HTTP tests, tears down
2. `go build ./cmd/infisical/...` — still compiles (no production code changed)

## Open Questions to Resolve During Implementation

1. **Which Node.js API endpoints** to use for seeding (signup flow, org creation, project creation) — need to check exact routes and payloads
2. **Auth token format** — will the Go Goa modules need to validate the JWT from Node.js, or are we testing without auth middleware initially?
3. **Node.js Docker image** — use `infisical/infisical:latest` or build from source (`../backend`)?
