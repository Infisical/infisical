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
gh.Fail(t, "GET", "/user", 0, fakenet.Hangup())                // drop the connection instead
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
3. For a vendor-hosted API, the host must be the one the client calls by default.
   Pointing a configurable base URL at fakenet proves the fake works and nothing about
   interception. A customer-hosted service, such as an appliance, has no default host:
   pass the fake's fixed `.test` name through the connection's normal host setting (see
   the [appliance table](#certificate-manager)).

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
| `aws` | `sts.amazonaws.com`, `sts.us-east-1.amazonaws.com`, `kms.us-east-1.amazonaws.com` | access key id | AWS IAM auth (JSON when asked); AWS external KMS with assume role (`SeedRole` trust policies enforce `sts:ExternalId`) |
| `azure` | `login.microsoftonline.com/<tenant>` | tenant id | Azure auth signing keys |
| `gcp` | `sts.googleapis.com`, `iamcredentials.googleapis.com` | workload identity pool id (from the STS audience, then the federated token) | GCP App Connection workload identity federation; verifies Infisical's token against the org's real JWKS, which it fetches at exchange time through the provider's `DialOrigin` |
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

DNS provider fakes (`cloudflare`, `dnsmadeeasy`, and Route 53 in `aws`) serve the TXT records created through
their APIs the same way, through `Emitter.SetTXT`, as the provider's nameservers would.

Route 53 also serves the TXT records a test seeds in a hosted zone. Seed the zone and its
record together through the account's `Route53` scope, with the value in quotes as Route 53
stores it:

```go
zone := "z" + id.Short() + ".acme.test"
cp.Route53.Seed(t, map[string]any{"zones": map[string]any{"Z1": map[string]any{
	"name":    zone,
	"records": []map[string]any{{"name": "_acme-challenge." + zone, "type": "TXT", "values": []string{`"token"`}}},
}}})
```

Reseeding the zone without the record withdraws it, and so does the end of the test. DNS
names are shared by every account, so generate the zone per test as above. A removal
leaves the name alone only if another account has since written different values to it;
two tests that publish the same name and values remove each other's answer.

## TLS certificates

fakenet answers TLS on port 443 for every name with a certificate it mints for that
name. A product that reads what a server presents, such as certificate discovery, can be
shown a certificate the test chose instead, until the test ends. The override is keyed by
hostname alone on the one listener every test shares, so generate the name per test and
use it for the certificate, the override, and what the product scans:

```go
name := "www-" + id.Short() + ".acme.test"
fakenet.ServeCertificate(t, fixture.FakenetAdmin(t, tn), name, certPEM, keyPEM)
```

fakenet also listens on port `fakenet.StallPort` for every name. It accepts TCP
connections and never answers, for a test that needs a client to wait out its own timeout,
such as a discovery scan kept running. Point the product at `<name>:<fakenet.StallPort>`.
fakenet closes a connection after 30 seconds, so the client's timeout must be shorter, and
it holds at most 64 at once: a connection past that is closed as soon as it is accepted.

## Certificate Manager

| Fake | Host | Scope | Used by |
|---|---|---|---|
| `website` | every name under `web.test`, over plain HTTP on port 80 | the label left of `web.test` | ACME HTTP-01: the web server behind a name the test makes up (`website.Name(scope, "www")`) |
| `acmeca` | `acme.ca.test/<scope>` | path | the upstream CA an ACME CA in Infisical orders from; verifies JWS, nonces and CSR names, validates DNS-01 against the TXT records the DNS provider fakes publish, and records every order placed (`Orders`) and revocations by the ordering account (`Issued[].RevokedAt`) |
| `cloudflare` | `api.cloudflare.com` | bearer API token | Cloudflare App Connections, DNS-01 records, and custom certificate syncs (paged list, upload, in-place update, delete) |
| `dnsmadeeasy` | `api.dnsmadeeasy.com` | `x-dnsme-apiKey`, with the HMAC checked | DNS Made Easy App Connections and DNS-01 records |
| `digicert` | `www.digicert.com` | `X-DC-DEVKEY` API key | DigiCert CAs: orders issue at once for names under a domain the account validated, otherwise wait for the DCV TXT record and a validation trigger; checks the product, `dns_names` and `dcv_method`, and puts the order's names on the certificate. Renewals (`RenewalIneligible`), reissues (held while a name's validation lapsed, `WithoutValidatedDomain`), reissue cancellation, certificate and order revocation, organization validations, the status-changes feed, orders issued in CertCentral for a test to import (`WithIssuedOrder`), and upstream revocations a poller finds (`RevokeOrder`) |
| `godaddy` | `api.godaddy.com` | API key of the `sso-key` header | GoDaddy CAs: certificates issue once domain control is proven and validation is triggered; renewal under the same id only from 60 days before to 30 days after expiry (`WithValidityDays` issues short-lived certificates to be inside it), and revocation |
| `venafitpp` | `tpp.venafi.test/<scope>` | path; the user is checked against `venafitpp.Password` | Venafi TPP CAs: OAuth tokens, requests under a policy folder (a request for an existing object re-enrolls it, counted in `Requests`), a retrieve that answers 202 once before the certificate, token revocation |
| `venaficloud` | `api.venafi.cloud` | `tppl-api-key` API key | Venafi TLS Protect Cloud: an intermediate CA signed through the CA's signing configuration; applications and issuing templates (`WithApplication`), requests issued as submitted, certificate contents |
| `aws` | `acm`, `acm-pca` and `elasticloadbalancing` in `us-east-1`; `route53.amazonaws.com` | access key id | AWS Private CA (`SeedPrivateCA`; revocation by serial; passthrough templates copy the CSR's extended key usages), ACM Public CA (renewal in place, revocation; a requested certificate reports its validation CNAME and is issued on the first status check, so ACM's 60 second retry never runs, but exports only once Route 53 serves that CNAME), ACM and Secrets Manager certificate syncs, ELB certificate syncs (`SeedListener`; certificates added to and removed from a listener's list, never its default), Route 53 DNS-01 and validation records (`SeedHostedZone`; TXT records served through `Emitter.SetTXT`) |
| `azureadcs` | `certsrv.adcs.test/<scope>` | path; NTLMv2 checked against `azureadcs.Password` | Azure AD CS CAs: web enrollment through `certfnsh.asp` and `certnew.cer` (`ReqID=CACert` serves the CA), denying templates the CA does not publish, listing templates on `certrqxt.asp`, and signing intermediates under CA templates (`WithCATemplates`) |
| `azure` | `*.vault.azure.net` | client id the tenant's token names (`fixture.AzureClientID`) | Azure Key Vault certificate syncs: PEM imports with their key, versions, soft-deleted names |
| `chef` | `api.chef.io` | `X-Ops-UserId`, with the request signature checked | Chef certificate syncs: data bag items |
| `imperva` | `my.imperva.com`, `api.imperva.com` | `x-API-Id`, with the key checked | Imperva certificate syncs: a site's custom certificate per key type |
| `oauth` | `www.googleapis.com` (the instance's JWT grant), `iamcredentials.googleapis.com`, `certificatemanager.googleapis.com` | impersonated service account email (`fixture.GCPServiceAccountEmail`) | GCP Certificate Manager syncs: impersonation, certificates (deletion refused while a certificate map entry points at one), certificate maps (`SeedGCPCertificateMap`) and their entries, long-running operations done once polled |

The GCP sync needs the instance's own service account, so the shared stack sets
`INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL`. That also configures GCP dynamic
secrets and PAM GCP on every shared suite. A test of their response when it is missing
needs an isolated harness with
`harness.WithInfisicalEnv("INF_APP_CONNECTION_GCP_SERVICE_ACCOUNT_CREDENTIAL", "")`.

A host registered as `*.<domain>` answers for every name under it; an exact host wins.

Appliances the customer hosts have no real hostname, so each fake answers on one fixed
`.test` name on port 443, and the connection's username, whose password the fake derives
(`<fake>.Password`), is the scope.

| Fake | Host | Scope | Used by |
|---|---|---|---|
| `f5bigip` | `bigip.f5.test` | username, then the `X-F5-Auth-Token` it issued | F5 BIG-IP certificate syncs: file uploads, `ssl-cert` and `ssl-key` installs, Client SSL profiles that use them, config saves |
| `kemp` | `loadmaster.kemp.test` | basic auth username | Kemp LoadMaster certificate syncs: certificates, the intermediate store, and the certificates each Virtual Service serves |
| `netscaler` | `adc.netscaler.test` | username, then the `NITRO_AUTH_TOKEN` cookie it issued | NetScaler certificate syncs: file uploads, certkeys, their SSL vserver bindings, config saves |
| `nutanix` | `prism.nutanix.test` | basic auth username or `X-ntnx-api-key` | Nutanix Prism Central certificate syncs: the cluster certificate, replaced only with the current ETag |
| `panos` | `firewall.panos.test` | username, then the `X-PAN-KEY` it issued | Palo Alto Networks certificate syncs: keygen, imports, SSL/TLS service profiles, commits, deletes refused while a profile presents the certificate (`WithCertificate`), and an import refusal (`RefuseImports`), since every call shares `/api/` and `Fail` cannot single imports out |
| `linuxserver` | SSH on port 22, any name (`ssh.linux.test` in connections) | SSH username | Linux Server certificate syncs: password logins, an SFTP filesystem (`WithDirectories`) that reports a missing directory with the `no such file` status text OpenSSH sends, and the `chown` command; anything else exits 127 |

Like LDAP, `linuxserver` is not HTTP: fakenet serves it on its own listener and finds the
host by the username of each login. Seed and read it through the admin API.

## Test plumbing once

Secret sync is tested end to end through GitHub. A new sync provider gets tests only for
its own logic, such as limits, key formatting, or pagination. A copy of the sync suite
re-tests the plumbing and the fake, not the provider.
