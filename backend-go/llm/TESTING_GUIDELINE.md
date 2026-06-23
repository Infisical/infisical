# Go Testing Guide

You write tests to constrain behavior, not to hit coverage targets. Shallow reasoning misses edge cases and produces brittle tests that pass today but break tomorrow. Every test you write should answer: "what contract does this code promise, and what breaks if someone violates it?"

## What NOT to Test

Not all code needs tests. Skip tests for:

- **Struct field assignment** — Tests like "sets default value" or "uses custom config" just verify that `=` works. If the constructor assigns `s.timeout = cfg.Timeout`, don't test it.
- **Trivial helpers** — A 3-line function with obvious logic doesn't need dedicated tests. If the implementation is shorter than the test, reconsider.
- **Constants** — Don't assert that a constant equals its defined value. If someone changes the constant, they meant to.
- **Generated code** — Code from `oapi-codegen` or similar tools is tested by the generator's own test suite.
- **Pass-through methods** — If a method just delegates to another and returns the result unchanged, test the underlying method instead.

**When unit and integration tests overlap:** If integration tests cover the same behavior, prefer them and skip redundant unit tests. Integration tests verify real behavior; duplicating coverage with unit tests adds maintenance burden without value.

**Keep unit tests for:**
- Branching logic with multiple code paths
- Parsing/formatting functions with edge cases
- Error handling paths that are tedious to trigger via integration tests
- Pure functions with complex transformations

## Core Rules

- Table-driven tests MUST use named subtests — every test case needs a `name` field passed to `t.Run`.
- Each test must be independent and if no co-relation you should use `t.parallel` to run tests parallel
- Integration tests MUST use build tags (`//go:build integration`) to separate from unit tests.
- Tests MUST NOT depend on execution order — each test MUST be independently runnable.
- Packages with goroutines SHOULD use `goleak.VerifyTestMain` in `TestMain` to detect goroutine leaks.
- Use testify as helpers, not a replacement for the standard library.
- Mock interfaces, not concrete types.
- Run tests with `-race` in CI.

## Test Naming

Follow the convention `Test<FunctionName>_<Scenario>`:

```go
func TestGetSecretByName_ReturnsErrWhenNotFound(t *testing.T) { ... }
func TestListSecrets_FiltersByEnvironment(t *testing.T) { ... }
func TestExpandSecrets_HandlesCircularReferences(t *testing.T) { ... }
```

The function name anchors what's under test. The scenario describes the specific behavior being verified. Together they read as a sentence: "Test GetSecretByName returns err when not found."

## Table-Driven Tests

Table-driven tests are the default style. They consolidate related scenarios that share the same setup/assertion shape into a single function. If multiple test setups can be organized together, prefer one table-driven test over many standalone functions.

Every entry MUST have a `name` field, and every entry MUST be run inside `t.Run`:

```go
func TestResolveSecretPath_Normalization(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "root path stays unchanged",
			input:    "/",
			expected: "/",
		},
		{
			name:     "trailing slash is stripped",
			input:    "/secrets/prod/",
			expected: "/secrets/prod",
		},
		{
			name:     "empty string defaults to root",
			input:    "",
			expected: "/",
		},
		{
			name:     "double slashes are collapsed",
			input:    "/secrets//prod",
			expected: "/secrets/prod",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := ResolveSecretPath(tc.input)
			assert.Equal(t, tc.expected, result)
		})
	}
}
```

### When to reach for table-driven tests

Use them when multiple cases share the same arrange/act/assert structure but differ in inputs and expected outputs. Do NOT force unrelated scenarios into one table — if the setup or assertion logic diverges significantly between cases, write separate test functions.

### Embedding behavior in table entries

For cases where each scenario needs slightly different setup or assertions, use function fields:

```go
func TestPermissionChecker_SecretAccess(t *testing.T) {
	tests := []struct {
		name    string
		setup   func(t *testing.T) *project.SecretAccessChecker
		check   func(checker *project.SecretAccessChecker) bool
		allowed bool
	}{
		{
			name: "read allowed when ability grants read on environment",
			setup: func(t *testing.T) *project.SecretAccessChecker {
				ability := buildAbility(t, project.SecretActionReadValue, "production", "/")
				return project.NewSecretAccessChecker(ability)
			},
			check: func(c *project.SecretAccessChecker) bool {
				return c.CanReadSecretValue("production", "/", "DB_HOST", nil)
			},
			allowed: true,
		},
		{
			name: "read denied when ability lacks environment",
			setup: func(t *testing.T) *project.SecretAccessChecker {
				ability := buildAbility(t, project.SecretActionReadValue, "staging", "/")
				return project.NewSecretAccessChecker(ability)
			},
			check: func(c *project.SecretAccessChecker) bool {
				return c.CanReadSecretValue("production", "/", "DB_HOST", nil)
			},
			allowed: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			checker := tc.setup(t)
			got := tc.check(checker)
			assert.Equal(t, tc.allowed, got)
		})
	}
}
```

## Mocking

Mock interfaces, never concrete types. This aligns with the codebase rule that interfaces are consumer-defined.

Define mock structs in the test file, next to the test that uses them. Only stub the methods the test actually calls:

```go
type mockSecretsService struct {
	listFn func(ctx context.Context, opts secrets.ListOpts) ([]secrets.Secret, error)
}

func (m *mockSecretsService) ListSecrets(ctx context.Context, opts secrets.ListOpts) ([]secrets.Secret, error) {
	return m.listFn(ctx, opts)
}
```

Usage in a test:

```go
func TestListSecretsV4_CallsServiceWithResolvedPath(t *testing.T) {
	var capturedOpts secrets.ListOpts

	svc := &mockSecretsService{
		listFn: func(_ context.Context, opts secrets.ListOpts) ([]secrets.Secret, error) {
			capturedOpts = opts
			return nil, nil
		},
	}

	handler := secret.NewHandler(&secret.Deps{Secrets: svc})
	_, err := handler.ListSecretsV4(ctx, &secret.ListSecretsV4ServiceRequestOptions{
		Query: &secret.ListSecretsV4Query{
			ProjectID:   "proj-123",
			Environment: "production",
			SecretPath:  nil, // should default to "/"
		},
	})

	require.NoError(t, err)
	assert.Equal(t, "/", capturedOpts.SecretPath)
}
```

Do NOT use a mocking framework that generates mocks for every interface in the codebase. Hand-rolled mocks are small, obvious, and live next to the test that needs them.

## Integration Tests

Integration tests run against real dependencies (Postgres via testcontainers, Redis, etc.) and are separated from unit tests with a build tag.

### Build tag

Every integration test file starts with:

```go
//go:build integration

package mypackage_test
```

This keeps `go test ./...` fast by default. Integration tests run explicitly:

```bash
make test  # runs: go test -race -tags=integration ./...
```

### Layout: grouped by domain

Integration tests live under `tests/`, grouped by domain (`tests/<product>/<domain>/`),
with shared infrastructure in `tests/infra/`:

```
tests/
├── infra/                  # testcontainers + HTTP client (shared by all suites)
│   └── nodejs/             # Node.js backend seed facade, split by domain
├── platform/
│   ├── auth/               # one package per domain
│   ├── kms/
│   └── permission/
└── secrets/
    └── secrets/            # list, get, permissions, cache, v3, service token
```

Each domain is its own `package <x>_test`. Keep all tests for one domain in that package
so they share its `TestMain` (one container boot) and helpers, and tests in other domains
run as separate packages in parallel.

### Test stack setup

`tests/infra` spins up the containers (Postgres, Redis, the Node.js backend) once per
package via `TestMain`. Build the stack with the `infra.New()` builder:

```go
//go:build integration

package secrets_test

import (
	"fmt"
	"os"
	"testing"

	"go.uber.org/goleak"

	"github.com/infisical/api/tests/infra"
)

var stack *infra.Stack

func TestMain(m *testing.M) {
	// Setup MUST come before m.Run() — goleak.VerifyTestMain won't work here
	// because it calls m.Run() internally and never returns.
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		WithEEFeatures("rbac", "groups", "secretApproval"). // license features the suite needs
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

### Per-test isolation + seed facade

The stack is shared, so isolation comes from each test seeding its **own** project (and
identities/secrets under it) rather than transaction rollback. Seed through the
`tests/infra/nodejs` facade — `stack.NodeJS().For(t)` — which drives the real Node.js API
with domain builders (required args in the constructor, optional setters, terminal `Do()`):

```go
func TestListSecrets_ReturnsCreatedSecret(t *testing.T) {
	t.Parallel()
	nj := stack.NodeJS()
	api := nj.For(t)

	proj := api.Projects.Create("list-secrets").Do()
	api.Secrets.Create(proj.ID, proj.EnvSlug, "DB_PASSWORD", "hunter2").
		Comment("primary db").
		Do()

	identity := api.Identities.Create("list-secrets-identity")
	api.Identities.AddToProject(proj.ID, identity.ID).Role("admin").Do()

	client := infra.NewClientBuilder(t, newSecretsRouter(t)).
		Identity(infra.MachineIdentity(identity.ID, nj.OrgID())).
		Build()
	// ... exercise the Go handler against the seeded project ...
}
```

Because every test owns a freshly-named project, suites run with `t.Parallel()` without
cross-contamination. Add new seed endpoints as builders in the matching `tests/infra/nodejs`
domain file (e.g. `secrets.go`, `identities.go`) so new params never break existing call
sites.

## Goroutine Leak Detection

Any package that spawns goroutines (background workers, watchers, connection pools) SHOULD check for leaks.

**Warning:** `goleak.VerifyTestMain(m)` calls `m.Run()` internally and never returns. If you need setup before tests run (e.g., starting containers), use `goleak.Find` after `m.Run()` instead:

```go
func TestMain(m *testing.M) {
	// Setup MUST come before tests run
	teardown := setupInfrastructure()

	code := m.Run()

	teardown()

	// Check for leaks only if tests passed
	if code == 0 {
		if err := goleak.Find(
			goleak.IgnoreTopFunction("..."), // known benign leaks
		); err != nil {
			fmt.Fprintf(os.Stderr, "goleak: %v\n", err)
			os.Exit(1)
		}
	}

	os.Exit(code)
}
```

If no setup is needed, `goleak.VerifyTestMain(m)` is simpler:

```go
func TestMain(m *testing.M) {
	goleak.VerifyTestMain(m)
}
```

If a known third-party goroutine is benign and cannot be stopped (e.g., a database driver's internal watcher), ignore it explicitly:

```go
goleak.IgnoreTopFunction("github.com/jackc/pgx/v5/pgxpool.(*Pool).backgroundHealthCheck")
```

## Race Detection

All tests — unit and integration — run with `-race` in CI. This catches data races that only manifest under concurrency. Design your tests accordingly:

- Do not share mutable state across parallel subtests without synchronization.
- If a test does `t.Parallel()`, ensure each subtest captures its loop variable (or use Go 1.22+ loop semantics).

```go
for _, tc := range tests {
	t.Run(tc.name, func(t *testing.T) {
		t.Parallel()
		// tc is safe here in Go 1.22+; for older versions, shadow it:
		// tc := tc
		result := doSomething(tc.input)
		assert.Equal(t, tc.expected, result)
	})
}
```

## Testify Usage

Use `require` for preconditions that must hold for the rest of the test to make sense. Use `assert` for the actual verification:

```go
func TestDecryptSecret_RoundTrip(t *testing.T) {
	key, err := kms.GenerateDataKey(ctx)
	require.NoError(t, err) // if this fails, nothing below is meaningful

	ciphertext, err := kms.Encrypt(ctx, key, []byte("plaintext"))
	require.NoError(t, err)

	plaintext, err := kms.Decrypt(ctx, key, ciphertext)
	assert.NoError(t, err) // the behavior we're actually testing
	assert.Equal(t, []byte("plaintext"), plaintext)
}
```

Do NOT use testify's suite package. Standard `Test` functions with table-driven subtests are simpler and compose better with Go's tooling (`go test -run`, `-count`, `-parallel`).

## Error Path Testing

Test the sad paths. Services in this codebase return structured errors via `errutil`. Verify both the error type and the message context:

```go
func TestGetSecret_ReturnsNotFoundForMissingKey(t *testing.T) {
	svc := setupService(t)

	_, err := svc.GetSecretByName(ctx, secrets.GetByNameOpts{
		FolderID: folderID,
		Key:      "NONEXISTENT",
	})

	require.Error(t, err)
	var appErr *errutil.Error
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, errutil.StatusNotFound, appErr.Status)
}
```

## Context and Logger in Tests

Follow the codebase constructor convention `(ctx, logger, deps)` in tests too. Use `context.Background()` for ctx and a test-scoped logger:

```go
func TestSomething(t *testing.T) {
	ctx := context.Background()
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelDebug}))

	svc := myservice.NewService(ctx, logger, &myservice.Deps{
		DB: testDB,
	})
	// ...
}
```

Or use a `testutil.Logger(t)` helper that ties log output to `t.Log` so it only appears on failure:

```go
// testutil/logger.go
func Logger(t *testing.T) *slog.Logger {
	t.Helper()
	return slog.New(slog.NewTextHandler(testWriter{t}, &slog.HandlerOptions{Level: slog.LevelDebug}))
}

type testWriter struct{ t *testing.T }

func (w testWriter) Write(p []byte) (int, error) {
	w.t.Helper()
	w.t.Log(string(p))
	return len(p), nil
}
```

## Checklist Before Submitting

1. `make test` passes (integration tests with `-race`).
2. `make lint` passes — no `//nolint` without a justification comment.
3. Every table-driven test case has a descriptive `name` and runs under `t.Run`.
4. Mocks are hand-rolled against consumer-defined interfaces, not generated against implementations.
5. Integration tests have the `//go:build integration` tag.
6. Seed helpers call `t.Helper()`.
7. `require` is used for preconditions, `assert` for verifications.
8. No test depends on another test running first.
