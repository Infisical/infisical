# Fakes

Read this before using or adding a fake, an App Connection, or mail.

## How interception works

- Infisical has no access to the real internet. Every hostname resolves to fakenet, which
  answers as that service or refuses with a 501 naming the URL.
- A fake is a working implementation holding real state, so tests assert on what the
  destination holds, not on which requests were sent.
- State is isolated by credential. Each App Connection invents a unique one, so parallel
  tenants never share fake state.

## Driving a fake

```go
conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
gh := github.Open(t, conn.FakenetAdmin(t), conn.Nonce())

gh.Seed(t, github.RepoSecret("acme/app", "UNMANAGED", "keep")) // state before the action
gh.Repo(t, "acme/app").Secrets                                 // state now
gh.Fail(t, "PUT", "/repos/*", 500, fakenet.Times(1))           // inject a failure
gh.Received(t, "GET", "/user")                                 // count calls
```

`github.Open` returns the fake's `ControlPlane`: the test's handle on one account's
state. Seed only what the test needs; extra state can hide a call that should not happen.

## Fake events

Fakes publish fake events when their state changes. These are harness signals, unrelated
to the backend's event outbox.

```go
mark := gh.Mark(t)
// ... delete a secret and trigger a sync ...

gh.ExpectEvent[github.SecretDeleted](t, func(e github.SecretDeleted) bool {
	return e.SecretName == "DROP"
}, fakenet.Since(mark))

gh.ExpectNoEvent[github.SecretCreated](t, nil) // waits 3s by default
```

- Events that already happened count, so waiting after a blocking call works.
- Each event satisfies one `ExpectEvent`; expecting a thing twice needs two occurrences.
- Order is checked only when asked, with `Mark` and `Since`.
- Assert absence with `ExpectNoEvent`, never with an immediate state read.

Mail uses the same mechanism:

```go
msg := tn.Mail(t).Expect(t, tn.Email("alice"), smtp.Subject("invitation"))
token, err := mail.Param(msg, "token")
```

## App Connections

```go
conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
```

Anything built on a connection, such as a secret sync, takes the `*AppConnection`.

A test about creating the connection itself calls the route through the generated client,
not the fixture. See `suites/appconnections/github_test.go`.

### Adding an App Connection kind

A fake is the external service; a kind is how one Infisical resource connects to it.

1. Add `fixture/appconnection_<app>.go` declaring an `AppConnectionKind` named after the
   app, auth method, and resource: `GitHubPATAppConnection`.
2. Take the host from the fake (`github.Service.Host()`); never write it twice.
3. The host must be one the client hardcodes. Pointing a configurable base URL at
   fakenet proves the fake works and nothing about interception.

A different resource on the same service, such as a dynamic secret, gets its own kind
type in its product's fixture package and reuses the fake.

## Adding a fake

One package under `fakes/<provider>/`:

1. A state struct shaped like the service, not like our code.
2. `ServeHTTP`, routing with Go 1.22 patterns
   (`PUT /repos/{owner}/{repo}/actions/secrets/{name}`).
3. `Host`, `Scope`, and `New`: the hostname, how to read the credential from a request,
   and an empty state.
4. Register it in `cmd/fakenet/main.go`.

`fakenet.Scope[S]` gives the test side `State`, `Seed`, `Fail`, `Calls`, and cleanup. The
state struct is shared by both sides, so a renamed field is a compile error.

- One fake per external provider, never per feature.
- Model the service faithfully: real pagination, error shapes, and crypto.
- A fake is an `http.Handler`; develop it in-process without Docker
  (`fakes/github/fake_test.go`).
- Publish a fake event wherever state changes. Name it
  `<provider>.<resource>-<past-tense verb>`:

```go
type SecretDeleted struct{ SecretDetail }
func (SecretDeleted) EventName() string { return "github.secret-deleted" }
```

## Identity providers

The test plays the workload or the person and holds the credential; the fake plays the
provider that checks it.

| Fake | Host | Scope | Used by |
|---|---|---|---|
| `oidcidp` | `idp.oidc.test/<scope>` | path | OIDC SSO; machine identity OIDC, JWT (jwks) and SPIFFE (`TrustKey` publishes a key the test signs with) |
| `oauth` | `www.googleapis.com`, `github.com`, `gitlab.com` | authorization code, which is also the access token | Google, GitHub, GitLab login; GCP service account certificates |
| `kubernetes` | `api.kubernetes.test` | reviewer JWT | machine identity Kubernetes auth (TokenReview) |
| `aws` | `sts.amazonaws.com`, `sts.us-east-1.amazonaws.com` | access key id | AWS IAM auth (JSON when asked) |
| `azure` | `login.microsoftonline.com/<tenant>` | tenant id | Azure auth signing keys |
| `alicloud` | `sts.aliyuncs.com` | access key id | Alibaba Cloud auth (checks the signature) |
| `oci` | `identity.us-ashburn-1.oraclecloud.com` | signature key id | OCI auth (checks the signature) |
| `ldap` | LDAP on port 389, any name | `dc=<scope>,dc=ldap,dc=test` | LDAP SSO and machine identity LDAP auth |

LDAP is not HTTP: fakenet serves it on its own listener and finds the directory by the
DN of each bind or search. Seed it through the admin API like any other fake.

## DNS records

Every A query resolves to fakenet. A product that proves domain ownership reads a TXT
record, so publish it first; it is removed when the test ends.

```go
fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_infisical-verification.acme.test", "value")
```

## Test plumbing once

Secret sync is tested end to end through GitHub. A new sync provider gets tests only for
its own logic, such as limits, key formatting, or pagination. A copy of the sync suite
re-tests the plumbing and the fake, not the provider.
