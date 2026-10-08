# Writing tests

Read this before writing or reviewing a test.

## A complete test

```go
// main_test.go: once per package
func TestMain(m *testing.M) { harness.Main(m, harness.Shared) }
```

```go
func TestSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse and keep the original when the same name is created twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "first")

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "TOKEN",
			api.CreateSecretV4JSONRequestBody{
				ProjectId:   proj.ID,
				Environment: "dev",
				SecretPath:  new("/"),
				SecretValue: "second",
			})

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode())
		require.Equal(t, "first", secretmanager.GetSecret(t, proj, "dev", "TOKEN").Value)
	})
}
```

## Profiles

| Profile | Gives | Use when |
|---|---|---|
| `harness.Shared` | one instance for the run, a fresh organization per test | almost always |
| `harness.Isolated` | the package's own Postgres, Redis, and Infisical | the test writes instance-wide state: super-admin config, login methods, encryption strategy, run modes |

`Isolated` costs a full boot per package. Containers the test talks to through Infisical,
such as a rotation target database, are added with `harness.WithInfra(...)`.

## Structure

- Setup in about eight lines, the action as one call, one to three assertions. A longer
  setup is a missing helper.
- Where the action is the assertion (`ExpectEvent`), write `// Action + Assert`.
- Add a `require` message only when the values do not explain the failure.
- Never call `require` from another goroutine; collect results and assert after.

## Naming

- Function: `Test<Resource>_<Behaviour>`.
- Subtest: `should <outcome> [when <condition>]`, lowercase. The outcome first, so a list
  of failures reads as a list of broken claims.
- A subtest name is a claim that can fail:

```
good  should hold a separate value per environment when one name is created in two
bad   should create secret in prod env        a label; claims no outcome
good  should refuse and keep the original when the same name is created twice
bad   should handle duplicates                "handle" cannot fail
```

- The subject is the operation being claimed about. Operations used for setup or
  observation are not subjects.
- One file per resource or flow; variants of a flow are subtests.

## Outcomes

The unit is (operation, outcome), not line coverage.

- Assert what a caller depends on, not that a route responded.
- Cover failure outcomes: refused, forbidden, another tenant's resource, not found,
  conflicting, unlicensed, repeated.
- A rejection test also checks that nothing changed.
- Assert error bodies where the message is part of the contract
  (`backend/CODE_QUALITY.md`).
- Use the actor the claim is about.
- When the name cannot carry the reason, add one line with `spec.Why`. Most tests do not
  need it.

## Waiting

- Never sleep.
- Infisical's own state, such as a sync status: poll the API with `internal/wait`.
- What a fake did: wait on its fake events with `ExpectEvent`. See
  [fakes.md](fakes.md#fake-events).
- Wait on the status the product records first, for a readable failure, then assert the
  outcome at the destination. A status alone does not prove the work happened.
- Interval-driven features: use the product's manual trigger instead of waiting for the
  interval.
- Deadline-driven features: move the deadline, not the clock.
- Budget: no single wait should need more than about 10 seconds.

## The harness API

```go
h := harness.From(t)
tn := h.NewTenant(t)                     // organization; tn.Admin signed up and owns it
tn.Email("alice")                        // alice@<tenant-domain>.test
tn.NewUser(t, harness.WithName("alice")) // invited through mail
tn.NewMachineIdentity(t, harness.OrgRole("admin"))
tn.Client(t, token)                      // a client on this tenant's rate-limit bucket
h.InstanceAdmin(t)                       // super admin; Isolated only
```

```go
proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
proj.NewUser(t, fixture.WithPrincipalName("bob"), fixture.WithRoles("admin"))
proj.Grant(t, principal, "developer")

secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "value", secretmanager.As(member))
secretmanager.GetSecret(t, proj, "dev", "DB_URL")
```

- Fixtures take required arguments positionally and the rest as options.
- `harness.OrgRole` and `fixture.WithRoles` are separate types, so organization and
  project roles cannot be mixed up.

## Entitlements and rate limits

Every tenant gets an enterprise plan, resolved per organization.

```go
tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
tn.SetPlan(t, license.Enterprise()) // verifies it took effect
```

- Pin downgrade behaviour with `should ... when the plan does not include it`. A license
  check must never change a read path (`backend/CODE_QUALITY.md`).
- Only plan-derived rate limits can be raised. The rest are per source address, which
  is why each tenant and principal gets its own and why clients are never built by hand.
