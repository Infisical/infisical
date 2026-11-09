# AGENTS.md

The Go blackbox suite. It boots a real Infisical in Docker and calls it over HTTP only.
Its contract with the server is a Docker image, environment variables, and the OpenAPI
spec, so the same tests run against any implementation of that contract.

## Read next

| Task | Read |
|---|---|
| Writing or reviewing a test | [docs/writing-tests.md](docs/writing-tests.md) |
| Using or adding a fake third party, App Connection, or mail | [docs/fakes.md](docs/fakes.md) |
| Calling an endpoint the client does not have yet | [docs/client.md](docs/client.md) |
| A failing, flaky, or CI-only test | [docs/debugging.md](docs/debugging.md) |

## What belongs here

Anything a customer or API client can observe: responses, status codes, error messages,
mail, calls to third parties, and effects of queues or crons after the response.

Not here:

- Pure functions and arithmetic. Unit test them in `backend/`.
- Anything needing direct access to Infisical's own Postgres or Redis, an internal
  service handle, or a mocked module. Those belong in `backend/e2e-test/`.
- Exhaustive input validation. Cover representative cases here; matrices go in unit
  tests.

## Commands

```bash
make test-suites   # shared suites; starts and stops the stack
make test-isolated # isolated suites, one package at a time
make test-harness  # harness tests on the shared stack
make test-all      # all three, the isolated run going ahead when the others fail
make test-unit     # no containers
make lint          # gofmt, vet, staticcheck
```

To iterate on one package, keep the stack up:

```bash
make up
go test ./suites/secretmanager/secrets/... -count=1
make down
```

`-count=1` disables Go's result cache. Run `make down` after changing a container's
configuration, or the old container is reused.

## Layout

```
suites/             behaviour, grouped by product (suites/secretmanager/secrets) or
                    platform area (suites/machineidentity, suites/user, suites/group);
                    harness.Shared only
suitesisolated/     packages on harness.Isolated, which write instance-wide state; each
                    boots its own stack, so they run one at a time (`make test-isolated`)
harnesstest/        harness behaviour; only for failures the harness alone can cause
                    (harnesstest/isolated is the harness's own Isolated package)
harness/            Stack, Profile, Tenant, Principal
fixture/            platform resources: projects, App Connections
fixture/<product>/  one package per product: secretmanager, kms, pki, pam
fixture/sso/        SAML and OIDC logins, for any suite whose claim needs an SSO session
fakes/              one package per external provider
internal/           wait, mail, id, apierr, spec
clients/api/        generated client; never edit by hand. Its own Go module (required through
                    a replace in go.mod), so `./...` leaves it out of vet, staticcheck and test
```

- Platform fixtures live in `fixture`; each product's fixtures live in
  `fixture/<product>`. A product owns its nouns: a secret in Secret Manager is not a
  secret in Cert Manager. Within a package, add a file per resource.
- Helpers start in the test package and move to a fixture on the second caller.
- Imports go one way: `fixture` may import `harness` and `fakes`; `harness` never imports
  a fixture; `fakes` import neither.

## Rules

- `t.Parallel()` on every test and subtest under `Shared`; never under `Isolated`.
- A package on `harness.Isolated` lives under `suitesisolated/` (or `harnesstest/isolated/`),
  and nothing else uses it. CI cannot hold several isolated stacks beside the shared one, so
  it runs these after the shared suites with `-p 1`; a layout test in `harness/` enforces it.
- Every test body is `// Setup`, `// Action`, `// Assert`.
- Assert with `testify/require` only.
- Every test creates its own tenant.
- Never build an API client by hand; use a principal's `.API` or `tn.Client`.
- Never sleep. Wait on the status the product records, then assert the outcome.
- Test plumbing once, not per provider.
- A rejection test also checks that nothing changed.
- Use the actor the claim is about, not `tn.Admin` by default.
- No package, fixture, or option for a single caller.

## Known issues

A test that pins a backend bug the change cannot fix asserts the intended behaviour and lives
in a function named `Test<Area>_KnownIssues`. It fails until the bug is fixed; run the suites
with `make test-suites TEST_FLAGS="-skip KnownIssues"` to leave them out, and `-run KnownIssues`
to run only them. When a fix lands, move the subtest into the ordinary test for that behaviour
and assert the exact status and message.

## Before you call it done

```bash
make lint
make test-all
make up && go test -p 4 ./suites/... ./harnesstest/shared/... -count=3; make down
go test -p 1 ./suitesisolated/... ./harnesstest/isolated/... -count=3; make down
```

The last command is the flake gate. A failure there is shared state leaking across
tenants. Then break the new assertion, and what it depends on, and confirm both fail.
