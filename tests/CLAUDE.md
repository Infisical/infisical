# CLAUDE.md

How to write tests in `tests/`, the Go blackbox suite. It boots a real Infisical in
Docker and talks to it over HTTP only.

This file is conventions. How the harness works inside is in the code and its
comments; you should not need any of it to write a test.

## 1. The boundary

**What belongs here:** anything a customer or an API client can observe. Requests,
responses, status codes, error messages, emails, outbound calls to third parties, and
behaviour that emerges from a queue or a cron after the response returns.

**What does not:**

- Pure functions and arithmetic. Unit tests in `backend/` are cheaper and sharper.
- Anything needing a database connection, an internal service handle or a mocked
  module. There is no database client here on purpose. If you want one, the test
  belongs in `backend/e2e-test/`.
- Log lines, outside boot behaviour.

**Why it exists separately.** `backend/e2e-test/` boots Fastify in-process and is
compiled against the Node source tree, so it cannot survive a rewrite. `e2e/` is
Playwright against a deployed environment and is deliberately smoke-level. This
suite's only contract with the server is **a Docker image, a set of environment
variables, and the OpenAPI spec**. Swap the image for a Go build and every test here
still runs, which is the entire point.

Input validation is observable, so it *can* be tested here, but every test costs a
tenant. Representative cases here; exhaustive matrices in unit tests.

## 2. Running tests

```bash
make test-suites   # product tests: ./suites/...
make test-harness  # harness tests: ./harnesstest/...
make test-all      # both
make test-unit     # everything that needs no containers
make lint          # gofmt, vet, staticcheck
```

The first three bring the stack up and tear it down afterwards, including after a
failure or a Ctrl-C.

They are separate targets so a red line says *which thing* broke: `test-suites`
failing means Infisical is broken, `test-harness` failing means the harness is.

To iterate, keep the stack up and run one package:

```bash
make up
go test ./suites/secretmanager/secrets/... -count=1
make down
```

`-count=1` because Go caches results, and a cached pass tells you nothing about a live
server. Run `make down` after changing anything about a container's configuration, or a
stale one is adopted and your change does not take effect.

## 3. Where things go

```
suites/          product behaviour: does Infisical do the right thing
harnesstest/     harness behaviour: does our tooling do the right thing
harness/         Stack, Profile, Tenant, Principal
fixture/         resource builders shared by more than one suite
fakes/           one package per faked third party
provider/        what creating an app connection needs, per service
internal/        wait, mail, id, apierr, spec
clients/api/     generated Infisical client, never hand-edit
```

**`suites/` or `harnesstest/`?** A harness test earns its place only if **the harness
is the only thing that can make it fail**. If a product change could break it, it is a
product test and belongs in `suites/`, or it does not belong at all. A failing suite
says Infisical is broken; a failing harnesstest says our tooling is. Mixing them sends
people to debug the wrong codebase.

Within `suites/`, group by product boundary, not URL version:
`suites/secretmanager/secrets`, `suites/organization`. `identity` owns routes across v1
and v2; `secrets` owns v4 and the v3 deprecations. That is what makes the grouping
survive a version bump.

**Helpers start local and move on the second caller.** An unexported function at the
bottom of the test file is the right home until a second package needs it; then it
becomes a `fixture/`. Do not create a package for one caller.

**Import direction is one-way.** `fixture/*` may import `harness`; `harness` must never
import a fixture. `fakes/*` import neither.

## 4. Writing a test

Every package needs a `main_test.go` declaring its profile. That is the only harness
decision a test author makes:

```go
func TestMain(m *testing.M) { harness.Main(m, harness.Shared) }
```

```go
func TestSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("ok/a created secret reads back with its value", func(t *testing.T) {
		t.Parallel()

		tn := h.NewTenant(t)
		proj := project.New(t, tn, project.WithType("secret-manager"))

		secret.Create(t, proj, "dev", "DB_URL", "postgres://localhost/app")

		if got := secret.Get(t, proj, "dev", "DB_URL"); got.Value != "postgres://localhost/app" {
			t.Errorf("secret read back as %q, want postgres://localhost/app", got.Value)
		}
	})
}
```

> Arrange in under about eight lines. Act in one call. Assert one to three claims.

If arrange is longer, the missing helper belongs beside the test or in a fixture.

### Profiles

| profile | what it gives | when |
|---|---|---|
| `harness.Shared` | one instance for the whole run, a fresh organization per test | almost always |
| `harness.Isolated` | the package's own Postgres, Redis and Infisical | only when the test writes instance-wide state |

`Isolated` costs a full Infisical boot per package. Reach for it only when the test
writes something not scoped to an organization: super-admin config, enabled login
methods, the encryption strategy, run modes.

### `t.Parallel()`

**Mandatory under `Shared`**, on the test and every subtest. Each test gets its own
tenant, so there is nothing to serialise. A `Shared` test that cannot be parallel is a
test in the wrong package.

**Do not call it under `Isolated`.** Those tests share one instance's global state.

### Tenancy is the isolation unit

`h.NewTenant(t)` creates an organization with its own administrator and registers its
deletion on `t.Cleanup`. Everything a test touches lives under that organization.
Choosing the org as the boundary is what makes `t.Parallel()` the default.

`tn.Admin` is a real invited user, not the instance root, and holds no super-admin flag.

## 5. Naming

Test function: `Test<Resource>_<Behaviour>`.

Subtest: `<outcome>/<what happened, in words>`. The prefix is not decoration; it is what
makes a run readable and what a lint can check.

| prefix | meaning |
|---|---|
| `ok/` | the happy path |
| `invalid/` | the request was malformed or referenced something that does not exist |
| `unauth/` | no credential, or an auth mode the route does not accept |
| `forbidden/` | authenticated but not allowed |
| `cross-tenant/` | another tenant's data was not reachable |
| `notfound/` | the target does not exist |
| `conflict/` | the request collided with existing state |
| `unlicensed/` | the plan does not include the feature |
| `idempotent/` | doing it twice is the same as doing it once |

**A subtest name is a claim, not a label.**

```
ok/the same key in a different environment is a different secret     yes
ok/create secret in prod env                                          no
conflict/the same key twice at the same path                          yes
conflict/duplicate                                                    no
```

**The subject is the operation whose behaviour is being claimed.** Operations used to
set up or observe are not subjects, so "the same key in two environments" is a subtest
of `TestSecret_Create` even though a read is how you see it. Something earns its own
top-level function only when no single operation owns the claim.

One file per resource or flow, named after it. Variants of one flow are subtests, not
new files.

## 6. Test outcomes, not coverage

Line coverage means nothing here. The unit is **(operation, outcome)**.

A test exists to pin a behaviour someone could break. If you cannot say what breaks
when it fails, do not write it.

**Assert what the caller depends on, not that a route responded.** A test that checks
`StatusCode() == 200` and stops has tested that a URL is routed.

**A rejection test must also check nothing changed.** A route can refuse *and* have
already written.

**Assert error bodies, not just statuses**, where the message is part of the contract.
`backend/CODE_QUALITY.md` requires messages a user can understand and forbids pointless
500s; a suite that only checks `== 400` never enforces that.

**Use the right actor.** A test about what a member can do must use a member. Reaching
for `tn.Admin` because it is convenient makes the claim vacuous.

**Suspect a test that passes the first time.** Break the assertion on purpose, watch it
fail, put it back. Then break *what it depends on*: a prune test that still passes when
deletion is disabled is testing nothing.

### `spec.Why`, sparingly

When the name cannot carry the reason, add one line: an invariant the rest of the suite
rests on, a past incident, a product constraint not visible in the test.

```go
spec.Why(t, `The set to delete is computed from what GitHub returns, not from anything
	Infisical stored, so this is only a real claim if the destination holds real state.`)
```

It prints on failure and in verbose output. Most tests do not need one. If every subtest
has one, they have stopped meaning anything.

## 7. The API you write against

```go
h  := harness.From(t)              // the stack this package's TestMain built
tn := h.NewTenant(t)               // fresh organization with its own admin
tn.Admin                           // *Principal: .API, .Token, .Email, .Kind, .ID
tn.Address("alice")                // alice@<orgslug>.test

tn.NewUser(t, harness.WithName("alice"))        // real user, invited through Mailpit
tn.NewIdentity(t, harness.OrgRole("admin"))     // machine identity
tn.Mail(t)                                      // Mailpit scoped to this tenant
tn.SetPlan(t, license.Enterprise().Without(license.RBAC))
tn.Client(t, token)                             // a client on this tenant's bucket

h.InstanceAdmin(t)                 // super admin; refused outside Isolated
```

Fixtures take the resource they belong to:

```go
proj := project.New(t, tn, project.WithType("secret-manager"))
proj.NewUser(t, project.Name("bob"), project.Role("admin"))
proj.Grant(t, principal, "developer")

secret.Create(t, proj, "dev", "DB_URL", "value", secret.Path("/svc"), secret.As(member))
secret.Get(t, proj, "dev", "DB_URL")
secret.Delete(t, proj, "dev", "DB_URL")

conn := appconnection.New(t, tn, provider.GitHub)
```

**Fixtures take required arguments positionally and everything else as options.** What
the API refuses without is positional; what the schema marks optional is an `Option`.
That is what lets someone add metadata or a different actor without touching every call
site. Do not add an option nothing uses yet: `staticcheck` will tell you, and adding one
later is a single line.

**Never build your own API client.** Use `tn.Admin.API`, a principal's `.API`, or
`tn.Client(t, token)`. A hand-built client loses the tenant's `X-Forwarded-For` address
and starts drawing down a rate-limit bucket shared with every other test, so the symptom
is a 429 in an unrelated package.

Organization roles and project roles are separate types on purpose:
`harness.OrgRole("admin")` and `project.Role("viewer")`. Passing one where the other
belongs does not compile.

## 8. Third parties are faked, not stubbed

The instance has **no access to the real internet**. Every hostname resolves to fakenet,
which either answers as that service or refuses with a 501 naming the URL.

A fake is a working implementation holding real state, so you assert on what the
destination ended up holding rather than on which requests were sent:

```go
conn := appconnection.New(t, tn, provider.GitHub)
gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())

gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "keep"))
// ... run a sync ...
gh.Repo(t, "acme/app").Secrets            // what GitHub holds now
gh.Fail(t, "PUT", "/repos/*", 500, fakenet.Times(1))
gh.Received(t, "GET", "/user")
```

That difference is the point. A secret sync computes what to delete from what the
destination *returns*, so stubbing that list would mean asserting against a fixture you
invented.

**Isolation is by credential.** Each connection invents a unique one and the product
sends it on every outbound call, so parallel tenants never see each other and no org id
is threaded anywhere.

### Adding a fake

One package under `fakes/<service>/`:

1. **The state struct**, shaped like the service rather than like our code.
2. **`ServeHTTP`**, routing with Go 1.22 patterns
   (`PUT /repos/{owner}/{repo}/actions/secrets/{name}`).
3. **`Host`, `Scope` and `New`**: the hostname, how to read the credential off a
   request, and an empty state.

Then one line in `cmd/fakenet/main.go`. The generic `fakenet.Scope[S]` gives the test
side `State`, `Seed`, `Fail`, `Calls` and cleanup, so a fake adds only naming.

The state struct is declared once and imported by both halves, so a field rename is a
compile error rather than a silent zero value.

**A fake is a plain `http.Handler`, so develop it in-process with no Docker at all**
(`fakes/github/fake_test.go` does this).

**One fake per service, never per feature.** GitHub is used by app connections, secret
sync, rotation and scanning; they all talk to the same GitHub.

**Model the service honestly.** Real pagination, real error shapes, real crypto. A fake
that always answers on one page hides the bug where we never fetch page two.

### Adding a provider

`provider/` carries only what *creating a connection* needs: the app slug, the hostname
the client hardcodes, and a `Create` closure. How the service behaves lives in its fake.

The hostname must be one the client hardcodes. If the provider lets you configure a base
URL and you point it at fakenet, the test proves the fake works and nothing about
interception.

## 9. Entitlements and rate limits

Every tenant gets a full enterprise plan by default, resolved **per organization**.

```go
tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
tn.SetPlan(t, license.Enterprise())   // also verifies it took effect
```

Use `unlicensed/` subtests to pin downgrade behaviour. `CODE_QUALITY.md` requires that a
license check never changes a read path, and flipping entitlements is the only way to
test that.

The rate limiter is on. Only the plan-derived limits (`readLimit`, `writeLimit`,
`secretsLimit`) can be raised; the rest are per source address, which is why every tenant
and principal gets its own and why you must not build your own client.

## 10. Time-dependent behaviour

Separate two questions usually tested as one: does the scheduler decide correctly when to
fire (pure arithmetic, unit test it), and does the right thing happen when it fires (this
suite). Almost all the value is in the second, and it does not require waiting.

**Interval-shaped features: use the product's own trigger.** Rotation and sync expose a
manual endpoint, so the interval never enters the test.

**Deadline-shaped features: move the deadline, not the clock.** Issue a certificate valid
for 7 days and set the alert threshold to 30.

**Async work is polled, never slept.** `internal/wait` exists for this. `time.Sleep` is
how you get a suite that is slow *and* flaky.

**Poll the thing that records the outcome, not the side effect.** A sync writes its status
and message to its own row; waiting on the destination instead turns every failure into an
identical timeout with nothing to explain it.

**Budget:** no `Shared` test waits more than about 60 seconds. A test that needs longer is
using the wrong lever.

## 11. The generated client

Every call goes through `clients/api`. There is no hand-written HTTP path: **a route the
generated client cannot reach is a route missing an `operationId`, and the fix belongs in
the router.**

To add an endpoint:

1. Add its `operationId` to `include-operation-ids` in `clients/api/oapi-codegen.yaml`.
2. Regenerate against a **non-production** instance:

```bash
INFISICAL_OPENAPI_URL=http://localhost:8080 make generate-client
```

The non-production part is not optional. The full spec resolves as
`NODE_ENV !== "production" && OPENAPI_FULL_SPEC`, and the harness container runs
`NODE_ENV=production`, so generating against it **silently drops operations**. Use the dev
stack, or a throwaway container from the harness image with `NODE_ENV=development`.

**Union bodies.** Where a whole request body is a union, oapi-codegen declares it as a
defined type, which does not inherit `MarshalJSON`, so it serialises as `{}`. Build the
body, `json.Marshal` it yourself, and post through `...WithBodyWithResponse`. A union
*field* inside an ordinary struct marshals fine.

**Union responses need unwrapping.** `createSecretV4` returns a secret *or* an approval
request. Call `AsCreateSecretV4200JSONResponseBody0()` and fail loudly on the other
branch, rather than letting an approval request read as success.

## 12. Debugging a failure

1. **Container logs**: `.logs/<timestamp>/<container>.log`, written unconditionally.
2. **The fakenet log**, one line per outbound call:
   `GET api.github.com/user -> 200 scope=7116dd6caf34...`. It answers "did the call happen
   at all, and under which credential" before anything else.
3. **`GET /__fake/denied`** on fakenet's admin port lists calls that reached no fake.
4. **Mailpit UI** on its mapped port, for anything email.
5. **`make status`** lists harness containers.

If an outbound call is refused, the host has no fake: register its `Service` in
`cmd/fakenet/main.go`, or add the missing route to the fake that owns it.

## 13. Anti-patterns

Each has bitten a suite like this before.

- `time.Sleep` instead of polling.
- Asserting on log lines instead of responses, outside boot tests.
- Package-level mutable state shared between tests.
- Using `tn.Admin` in a test about what a member can do.
- Seeding more than the test needs, which hides an outbound call the code should not have
  made.
- A `Shared` test that cannot be `t.Parallel()`. It is in the wrong package.
- Asserting only status codes where the message is part of the contract.
- Reaching for the database. There is no client, deliberately.
- A package, fixture or option created for one caller.

## 14. Before you call it done

```bash
make lint
make test-all
make up && go test -p 4 ./suites/... ./harnesstest/... -count=3; make down
```

The last one is the flake gate, and it deliberately runs both trees at once: the bugs it
catches are cross-package. **Anything failing it is shared state that escaped the tenant
boundary.**

Then do the thing that is easy to skip: break your new assertion on purpose, and break
what it depends on, and watch both fail.
