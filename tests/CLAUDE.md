# CLAUDE.md

Everything needed to write tests in `tests/`, the Go blackbox suite. It boots a real
Infisical in Docker and talks to it over HTTP only.

## 1. The boundary

**What belongs here:** anything a customer or an API client can observe. Requests,
responses, status codes, error messages, emails, outbound calls to third parties,
and behaviour that emerges from a queue or a cron after the response returns.

**What does not:**

- Pure functions and arithmetic. Unit tests in `backend/` are cheaper and sharper.
- Anything requiring a database connection, an internal service handle or a mocked
  module. There is no database client here on purpose. If you want one, the test
  belongs in `backend/e2e-test/`.
- Log lines, outside boot behaviour.

**Why it exists separately from the other two suites.** `backend/e2e-test/` boots the
Fastify app in-process and is compiled against the Node source tree, so it cannot
survive a rewrite. `e2e/` is Playwright against a deployed environment and is
deliberately smoke-level. This suite's only contract with the server is **a Docker
image, a set of environment variables, and the OpenAPI spec**. Swap the image for a
Go build and every test here still runs, which is the entire point.

## 2. Quick start

```bash
make test-suites   # product tests: ./suites/...
make test-harness  # harness tests: ./harnesstest/...
make test-all      # both
make test-unit     # everything that needs no containers
make lint          # gofmt, vet, staticcheck
```

Each of the first three brings the stack up, runs its packages, and tears the stack
down on the way out, including after a failure or a Ctrl-C. The exit status is the
test run's, so a red run stays red.

They are separate targets so a red line says _which thing_ broke: `test-suites`
failing means Infisical is broken, `test-harness` failing means the harness is. One
target reporting both would erase that distinction, which is the whole reason the two
directories exist.

To iterate, keep the stack up and run one package:

```bash
make up
go test ./suites/secretmanager/secrets/... -count=1
make down
```

`-count=1` because Go caches results, and a cached pass tells you nothing about a
live server.

Other targets: `make status` lists harness containers, `make test-docker` runs the
infra layer's own container tests, `make fmt` formats.

## 3. How the stack works

`make up` starts five containers on a Docker network:

```
inf-shared-postgres      postgres:14-alpine, max_locks_per_transaction=512
inf-shared-redis         redis:7-alpine
inf-shared-mailpit       fake SMTP with a search API
inf-shared-fakenet       the fake internet: DNS, our fakes over TLS, a control API
inf-shared-infisical-<image id>   built from backend/Dockerfile
```

Boot costs about 25 seconds, almost all of it 540 migrations.

**Container identity is the container name.** A test binary asks for a container by
name, adopts it if it exists and creates it if it does not. That is why `go test`
with nothing running works, and why a second run is fast. It also means **changing a
shared container's configuration silently adopts a stale one**: if you change an
image tag or a command flag, run `make down` first or the change will not take
effect.

fakenet is the exception, and deliberately so: its name carries its image ID, so
editing a fake produces a fresh container, and the previous generation is removed
first because only one container can hold the fixed address.

**Nothing auto-cleans.** Testcontainers' reaper is disabled, because it deletes by
the _creating_ session's label and would reap containers another binary had adopted.
Cleanup belongs to `make down`. After an interrupted run, `make down` is also the fix
for a stale container.

**Container logs are written unconditionally** to `.logs/<timestamp>/<container>.log`
next to the package, gitignored. You can tail one while a test hangs.

## 4. Layout

```
tests/
├── suites/          product behaviour: does Infisical do the right thing
├── harnesstest/     harness behaviour: does our tooling do the right thing
│   ├── shared/
│   └── isolated/
├── harness/         Stack, Profile, Tenant, Principal, instance lifecycle
│   └── infisical/   the application container module
├── fixture/         per-product resource builders: project, appconnection
├── fakes/           one package per faked service: github, license
├── provider/        what creating an app connection needs, per service
├── infra/           product-agnostic container layer
│   └── fakenet/     the fake-internet engine and its container module
├── internal/        mail, id, apierr, spec
├── clients/api/     generated Infisical client — never hand-edit
├── cmd/fakenet/     the fake-internet server
└── cmd/inf/         up, down, status
```

**`suites/` or `harnesstest/`?** A harness test earns its place only if **the harness
is the only thing that can make it fail**. If a product change could break it, it is a
product test and belongs in `suites/`, or it does not belong at all.

This matters because of what a red run means. A failing suite says Infisical is
broken; a failing harnesstest says our tooling is. Mixing them sends people to debug
the wrong codebase, and when the API is rewritten the suites are the contract that
must pass unchanged while the harness tests are not.

Within `suites/`, group by product boundary, not URL version:
`suites/secretmanager/secrets`, `suites/organization`, `suites/project`. `identity`
owns routes across v1 and v2; `secrets` owns v4 and the v3 deprecations. That is what
makes the grouping survive a version bump.

**Import direction is one-way.** `fixture/*` may import `harness`; `harness` must
never import a fixture. That is what lets someone add `fixture/pki` without touching
anything else.

## 5. Writing a test

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

		created := createSecret(t, tn, proj.ID, "dev", "/", "DB_URL", "postgres://localhost/app")
		got := getSecret(t, tn, proj.ID, "dev", "/", "DB_URL")

		if got.SecretValue != "postgres://localhost/app" {
			t.Errorf("secret read back as %q, want postgres://localhost/app", got.SecretValue)
		}
	})
}
```

### Profiles

| profile            | what it gives                                                 | when                                          |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------- |
| `harness.Shared`   | one instance for the whole run, a fresh organization per test | almost always                                 |
| `harness.Isolated` | the package's own Postgres, Redis and Infisical               | only when the test writes instance-wide state |

`Isolated` costs a full Infisical boot, roughly 40 to 50 seconds per package. Reach
for it only when the test writes something not scoped to an organization: super-admin
config, enabled login methods, the encryption strategy, run modes.

### `t.Parallel()`

**Mandatory under `Shared`**, on the test and every subtest. Each test gets its own
tenant, so there is nothing to serialise. A `Shared` test that cannot be parallel is
a test in the wrong package.

**Do not call it under `Isolated`.** Those tests share one instance's global state.
They still run concurrently with other packages, because each test binary owns its
containers.

### Tenancy is the isolation unit

`h.NewTenant(t)` creates an organization with its own administrator, and registers
its deletion on `t.Cleanup`. Everything a test touches lives under that organization.
Choosing the org as the boundary is what makes `t.Parallel()` the default rather than
the exception.

The admin is a real invited user at `admin@<orgslug>.test`, not the instance root. It
has no super-admin flag, so a test cannot reach instance-wide state through it. This
was wrong once, and every `Shared` test held instance-admin power until it was fixed.

## 6. Naming

Test function: `Test<Resource>_<Behaviour>`.

```go
func TestSecret_Create(t *testing.T)
func TestProject_Access(t *testing.T)
```

Subtest: `<outcome>/<what happened, in words>`. The prefix is not decoration; it is
what makes a run readable and what a lint can check.

| prefix          | meaning                                                               |
| --------------- | --------------------------------------------------------------------- |
| `ok/`           | the happy path                                                        |
| `invalid/`      | the request was malformed or referenced something that does not exist |
| `forbidden/`    | authenticated but not allowed                                         |
| `cross-tenant/` | another tenant's data was not reachable                               |
| `notfound/`     | the target does not exist                                             |
| `conflict/`     | the request collided with existing state                              |
| `unlicensed/`   | the plan does not include the feature                                 |
| `idempotent/`   | doing it twice is the same as doing it once                           |

One file per resource or flow, named after it: `create_test.go`, `access_test.go`.
Variants of one flow are subtests, not new files.

## 7. Test outcomes, not coverage

A test exists to pin a behaviour someone could break. If you cannot say what breaks
when it fails, do not write it.

**Assert what the caller depends on, not that a route responded.** A test that checks
`StatusCode() == 200` and stops has tested that a URL is routed. `TestProject_Create`
did exactly that; it now checks the project landed in the caller's organization and
that `dev`, `staging` and `prod` were provisioned, because those are what a caller
relies on.

**A rejection test must also check nothing changed.** A route can refuse _and_ have
already written. The duplicate-secret test re-reads the secret and asserts the
original value survived.

**Assert error bodies, not just statuses**, where the message is part of the contract.
`backend/CODE_QUALITY.md` requires messages a user can understand and forbids
pointless 500s; a suite that only checks `== 400` never enforces that.

**Suspect a test that passes the first time.** Break the assertion on purpose, watch
it fail, put it back. A test you have never seen fail is a test you have not verified.

**Use the right actor.** A test about what a member can do must use a member. Reaching
for `tn.Admin` because it is convenient makes the claim vacuous.

### `spec.Why`, sparingly

When the name cannot carry the reason, add one line of why: an invariant the rest of
the suite rests on, a past incident, a product constraint not visible in the test.

```go
spec.Why(t, `Create must not silently overwrite. If it did, a caller expecting to add
	a secret could replace one already in use and never learn about it.`)
```

It prints as a `why:` line in verbose output. Most tests do not need one. If every
subtest has one, they have stopped meaning anything.

## 8. The harness API

```go
h  := harness.From(t)              // the stack this package's TestMain built
tn := h.NewTenant(t)               // fresh organization with its own admin
tn.Admin                           // *Principal: .API, .Token, .Email, .Kind, .ID
tn.OrgID, tn.OrgSlug
tn.Address("alice")                // alice@<orgslug>.test

tn.NewUser(t, harness.WithName("alice"))        // real user, invited through Mailpit
tn.NewIdentity(t, harness.OrgRole("admin"))     // machine identity, universal auth
tn.Mail(t)                                      // Mailpit scoped to this tenant's domain
tn.SetPlan(t, license.Enterprise().Without(license.RBAC))
tn.Verify(t, plan)                              // assert the instance resolved the plan
tn.Client(t, token)                             // a client on this tenant's rate-limit bucket

h.InstanceAdmin(t)                 // super admin; refused outside Isolated
```

Fixtures live in their own packages and take the tenant:

```go
proj := project.New(t, tn, project.WithType("secret-manager"))
proj.ID, proj.Slug, proj.Environments
proj.NewIdentity(t, project.Role("admin"))
proj.NewUser(t, project.Name("bob"), project.Role("admin"))
proj.Grant(t, principal, "developer")

conn := appconnection.New(t, tn, provider.GitHub)
appconnection.Try(t, tn, provider.GitHub, appconnection.RejectCredentials(401))
```

A connection carries the credential its fake is keyed on, so the two travel together:

```go
gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())
gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "keep"))
gh.Repo(t, "acme/app").Secrets          // what the destination holds now
gh.Fail(t, "PUT", "/repos/*", 500, 1)   // failure injection
gh.Received(t, "GET", "/user")          // the call log
```

**Never build your own API client.** Use `tn.Admin.API`, a principal's `.API`, or
`tn.Client(t, token)`. A hand-built client loses the tenant's `X-Forwarded-For`
address and starts drawing down a rate-limit bucket shared with every other test, so
the symptom is a 429 in an unrelated package.

Organization roles and project roles are separate types on purpose:
`harness.OrgRole("admin")` and `project.Role("viewer")`. Passing one where the other
belongs does not compile. It used to be silently ignored.

## 9. Outbound calls and fakes

The instance has **no access to the real internet.** fakenet answers DNS for every
hostname, so nothing resolves to a real address, and a host nobody faked gets a 501
naming it:

```
fakenet has no fake for GET https://api.checklyhq.com/v1/accounts: no fake is
registered for this host
```

This is load bearing, and it was measured rather than assumed: with plain Docker
network aliases and no DNS of our own, a container on the harness network reaches
`api.checklyhq.com` and gets a real 401 back from Checkly.

### Fakes, not stubs

A fake is a working implementation of a service, holding real state. You assert on
what the destination ended up holding, not on which requests were sent:

```go
conn := appconnection.New(t, tn, provider.GitHub)
gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())

gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "keep"))
// ... trigger a sync, delete a secret, trigger again ...
got := gh.Repo(t, "acme/app").Secrets
```

That difference is the point. A secret sync computes what to delete from what the
destination _returns_, so stubbing that list means asserting against a fixture you
invented. The same goes for the key-schema guard, `disableSecretDeletion`, and the
sealed box: the GitHub fake holds the private key, so `Secrets["DB_URL"].Value` is the
plaintext that actually arrived.

One fakenet serves every tenant, so **isolation is by credential, not by server**.
Each connection invents a unique one, the product sends it on every outbound call,
and fakenet keys state on it. No org id is threaded anywhere.

### How interception works

fakenet runs its own DNS server, and Infisical is started with `--dns <fakenet>`.
Docker's embedded resolver still answers container names first, so `postgres` and
`redis` are unaffected; everything else falls through to fakenet, which answers with
its own address. It then serves 443, minting a certificate per name asked for, signed
by a CA the instance was told to trust.

No `HTTP_PROXY`, no `CONNECT`, no host aliases. Three consequences worth knowing:

- **`safeRequest` stops being a problem.** It resolves a hostname up front and pins
  the socket to that IP. With a proxy that meant dialling the real host on the proxy's
  port and hanging for 100 seconds. Now the pin lands on fakenet because fakenet _is_
  the address.
- **Clients that ignore proxy env are covered**, which the AWS, GCP and Azure SDKs all
  do. DNS asks for no cooperation.
- **`ALLOW_INTERNAL_IP_CONNECTIONS=true` is required**, because fakenet answers for
  public hostnames from a private address and the SSRF guard would otherwise refuse.

fakenet holds a fixed address (`10.201.0.53`) on a fixed subnet, because Infisical is
told where to resolve when its container is created and is then adopted by later test
binaries. Its CA lives in `tests/.cache/` for the same reason: editing a fake rebuilds
fakenet, and a CA minted per boot would leave a running Infisical trusting an
authority that no longer exists. `make down` removes both together.

### Writing a fake

One package under `fakes/<service>/`, holding three things:

1. **The state struct**, shaped like the service rather than like our code.
2. **`ServeHTTP`**, routing with Go 1.22 patterns
   (`PUT /repos/{owner}/{repo}/actions/secrets/{name}`).
3. **`Host`, `Scope` and `New`** — the hostname, how to read the credential off a
   request, and an empty state.

Then one line in `cmd/fakenet/main.go`. The generic `fakenet.Scope[S]` gives the test
side `State`, `Seed`, `Fail`, `Calls` and cleanup, so a fake adds only naming.

The state struct is declared once and imported by both halves, so a field rename is a
compile error rather than a silent zero value.

**A fake is a plain `http.Handler`, so develop it in-process with no Docker at all**
(`fakes/github/fake_test.go` does this). The container is only how the suite consumes
it.

**One fake per service, never per feature.** GitHub is used by app connections, secret
sync, rotation and scanning; they all talk to the same GitHub. Splitting them would
mean two things claiming to be GitHub and free to disagree.

### Adding a provider

`provider/` carries only what _creating a connection_ needs: the app slug, the
hostname the client hardcodes, and a `Create` closure calling the generated client.
How the service behaves once reached lives in its fake.

The hostname must be one the client hardcodes. If the provider lets you configure a
base URL and you point it straight at fakenet, the test proves the fake works and
nothing about interception.

## 10. Entitlements

Every tenant gets a full enterprise plan by default. The instance runs in Cloud mode
against a faked license server, which is what makes plans resolve **per
organization** rather than instance-wide.

```go
tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
tn.SetPlan(t, license.Enterprise())       // also verifies it took effect
```

`SetPlan` and `Verify` read the plan back with `refreshCache=true`, which busts the
900-second Redis cache and asserts the fake produced what was asked for. A wrong
feature key otherwise surfaces much later as a 403 in an unrelated test.

Use `unlicensed/` subtests to pin downgrade behaviour. `CODE_QUALITY.md` requires that
a license check never changes a read path, and flipping entitlements is the only way
to test that.

## 11. Rate limits

The limiter is registered because the harness runs Cloud mode. Three tiers, and you
can only move one:

| where the limit comes from | examples                                                        | raisable                  |
| -------------------------- | --------------------------------------------------------------- | ------------------------- |
| the organization's plan    | `readLimit`, `writeLimit`, `secretsLimit`                       | yes, via the license fake |
| instance configuration     | `authRateLimit`, `inviteUserRateLimit`, `identityCreationLimit` | no                        |
| a literal in the source    | `smtpRateLimit`, 2 per **40s**                                  | no                        |

`PUT /api/v1/rate-limit` looks like the lever for the middle tier and is inert here:
the sync that reads its row is gated on an entitlement Cloud mode never resolves.

**So the source address is the lever.** Every tenant and every principal gets its own
`X-Forwarded-For`, which is also why you must not build your own client. The tightest
limit is the org invite at two per forty seconds per address, which is why creating a
user mints a fresh address.

## 12. Time-dependent behaviour

Separate two questions usually tested as one: does the scheduler decide correctly when
to fire (pure arithmetic, unit test it), and does the right thing happen when it fires
(this suite). Almost all the value is in the second, and it does not require waiting.

**Interval-shaped features: use the product's own trigger.** Rotation and sync expose
a manual endpoint. Testing through it tests a real surface, and the 25-day interval
never enters the test.

**Deadline-shaped features: move the deadline, not the clock.** Certificates and
leases carry their deadline in the artifact, and both the deadline and the threshold
are user input. Issue a certificate valid for 7 days and set the alert threshold to
30, and the condition is true immediately.

**Async work is polled, never slept.** Syncs, rotations, webhooks and audit logs land
after the response returns. `time.Sleep` is how you get a suite that is slow _and_
flaky. There is no shared polling helper yet; `internal/mail` has a private loop, and
the second caller should extract one.

**Budget rule:** no `Shared` test waits more than about 60 seconds. A test that needs
longer is telling you it is using the wrong lever.

## 13. The generated client

Every call goes through `clients/api`, generated by oapi-codegen. There is no
hand-written HTTP path: **a route the generated client cannot reach is a route missing
an `operationId`, and the fix belongs in the router, not here.**

To add an endpoint:

1. Add its `operationId` to `include-operation-ids` in
   `clients/api/oapi-codegen.yaml`.
2. Regenerate against a **non-production** instance:

```bash
INFISICAL_OPENAPI_URL=http://localhost:8080 make generate-client
```

The non-production part is not optional. `env.ts` resolves the full spec as
`NODE_ENV !== "production" && OPENAPI_FULL_SPEC`, and the harness container runs
`NODE_ENV=production` on purpose. Generating against it **silently drops operations**
rather than failing. Use the dev stack, or boot a throwaway container from the harness
image with `NODE_ENV=development`.

If the route has no `operationId`, add one in the backend router first; without it
oapi-codegen derives a name from the path, which changes when the path does.

### Two generator traps

**Union request bodies do not marshal.** oapi-codegen declares the request-body type
as a _defined type_ over the union struct, and a defined type does not inherit
methods, so the generated `MarshalJSON` is lost and the union serialises as `{}`.
Build the `JSONBody`, `json.Marshal` it yourself, and post through
`...WithBodyWithResponse`.

**Union responses need unwrapping.** `createSecretV4` returns a secret _or_ an
approval request. Call `AsCreateSecretV4200JSONResponseBody0()` and fail loudly if it
is the other branch, rather than letting an approval request read as success.

## 14. Debugging a failure

1. **Container logs**: `.logs/<timestamp>/<container>.log`, written unconditionally.
2. **The fakenet log**, which carries one line per outbound call:
   `GET api.github.com/user -> 200 scope=7116dd6caf34...`. It answers "did the call
   happen at all, and under which credential" before anything else.
   `GET /__fake/denied` lists calls that reached no fake.
3. **Mailpit UI**: the mapped port on the Mailpit container, for anything email.
4. **`make status`** lists harness containers and their state.
5. If an outbound call is refused, the host has no fake. Register its `Service` in
   `cmd/fakenet/main.go`, or add the missing route to the fake that owns it.

## 15. Anti-patterns

Each has bitten a suite like this before.

- `time.Sleep` instead of polling.
- Asserting on log lines instead of responses, outside boot tests.
- Package-level mutable state shared between tests.
- Using `tn.Admin` in a test about what a member can do.
- Seeding more than the test needs, which hides an outbound call the code should not
  have made.
- A `Shared` test that cannot be `t.Parallel()`. It is in the wrong package.
- Asserting only status codes where the message is part of the contract.
- Reaching for the database. There is no client, deliberately.
- Naming a test file after a harness source file.

## 16. Before you call it done

```bash
make lint
make test-all
make up && go test -p 4 ./suites/... ./harnesstest/... -count=3; make down
```

The last one is the flake gate, and it deliberately runs both trees at once: the bugs
it catches are cross-package, so narrowing it to one tree would hide them. **Anything
failing it is shared state that escaped the tenant boundary**, and it is the single
most valuable check here.

Then do the thing that is easy to skip: break your new assertion on purpose and watch
it fail.

## 17. Known gaps

Honest state, so you do not assume coverage that is not there.

- Product coverage is thin: organization, project and secret creation only.
- No `internal/wait` helper yet, so polling is hand-rolled per call site.
- Secret sync and rotation are not covered; neither is PKI, PAM, KMS, scanning or SSO.
  The GitHub fake already serves the sync endpoints, so the suite is the missing half.
- Only two fakes exist: `github` and `license`. AWS Parameter Store is the next one
  worth writing, since it is the only way to reach the SDK retry and batching paths.
- Three operation IDs in the generated client have no caller
  (`listSecretsV4`, `beginEmailSignupV3`, `verifyEmailSignupV3`).
- `-p` is not pinned in the Makefile, so local and CI exercise different amounts of
  concurrency.
