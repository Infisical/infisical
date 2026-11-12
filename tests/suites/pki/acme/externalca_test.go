package acme_test

import (
	"crypto"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/acmeca"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/fakes/dnsmadeeasy"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// openUpstream is a fake upstream ACME CA of the tenant's own.
func openUpstream(t *testing.T, tn *harness.Tenant) *acmeca.ControlPlane {
	t.Helper()
	scope := id.Nonce()
	admin := fixture.FakenetAdmin(t, tn)
	fakenet.Track(t, admin, acmeca.Service.Host(), scope)
	return acmeca.Open(t, admin, scope)
}

// cloudflareCA is an Infisical ACME CA ordering from an upstream CA and answering its
// DNS-01 challenges in a Cloudflare zone.
func cloudflareCA(t *testing.T, tn *harness.Tenant, proj *pki.Project) (pki.CA, *acmeca.ControlPlane, *cloudflare.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.CloudflareAPITokenAppConnection)
	zone := id.Nonce()
	dns := cloudflare.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	dns.Seed(t, cloudflare.WithZone(zone))
	up := openUpstream(t, tn)
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderCloudflare, zone, up.DirectoryURL()), up, dns
}

// dnsMadeEasyCA is the same through a DNS Made Easy zone named zoneName.
func dnsMadeEasyCA(t *testing.T, tn *harness.Tenant, proj *pki.Project, zoneName string) (pki.CA, *acmeca.ControlPlane, *dnsmadeeasy.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.DNSMadeEasyAPIKeyAppConnection)
	const zone = "1001"
	dns := dnsmadeeasy.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	dns.Seed(t, dnsmadeeasy.WithZone(zone, zoneName))
	up := openUpstream(t, tn)
	return pki.NewAcmeCA(t, proj, conn, api.CreateAcmeCertificateAuthorityV1JSONBodyConfigurationDnsProviderConfigProviderDnsMadeEasy, zone, up.DirectoryURL()), up, dns
}

// upstreamIssuance is how long an order waits for a certificate from the upstream CA.
// Infisical issues those one at a time across the instance, and each DNS Made Easy
// issuance spends 10 seconds waiting for a record it looks up by a name that never
// resolves, so parallel tests queue well past the default 30 seconds.
const upstreamWait = 2 * time.Minute

var upstreamIssuance = wait.Timeout(upstreamWait)

// allowNames narrows a policy to one common name and one DNS SAN.
func allowNames(t *testing.T, commonName, dnsName string) api.CreateCertificatePolicyJSONRequestBody {
	t.Helper()
	body := pki.AllowAll(t)
	var cn api.CreateCertificatePolicyJSONBody_Subject_Item
	require.NoError(t, cn.FromCreateCertificatePolicyJSONBodySubject0(api.CreateCertificatePolicyJSONBodySubject0{
		Type:    api.CreateCertificatePolicyJSONBodySubject0TypeCommonName,
		Allowed: &[]string{commonName},
	}))
	body.Subject = &[]api.CreateCertificatePolicyJSONBody_Subject_Item{cn}
	(*body.Sans)[0].Allowed = &[]string{dnsName}
	return body
}

// withCertificateKey makes the project's certificate KMS key exist before parallel
// subtests use it. Infisical creates that key on first use without locking the project
// (getProjectKmsCertificateKeyId), so concurrent first uses each create one and data
// encrypted under the losing key no longer decrypts.
func withCertificateKey(t *testing.T, proj *pki.Project) {
	t.Helper()
	pki.NewInternalCA(t, proj)
}

// readyOrder registers on a profile and orders names on a site, passing their HTTP-01
// challenges on Infisical.
func readyOrder(t *testing.T, p acmeProfile, site siteName, names ...string) (*acmeClient, Order) {
	t.Helper()
	c := p.registered(t)
	o := c.NewOrder(t, names...)
	passHTTP01(t, c, site.ControlPlane, o.Authorizations)
	waitOrder(t, c, o.URL, "ready")
	return c, o
}

// cnFor is the common name a subject row asks for: none, or the name itself.
func cnFor(withCommonName bool, name string) string {
	if withCommonName {
		return name
	}
	return ""
}

func TestAcmeExternalCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, subject := range []struct {
		name       string
		commonName bool
	}{{"with a common name", true}, {"without a common name", false}} {
		t.Run("should issue from the upstream CA after answering DNS-01 in Cloudflare "+subject.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := pki.CertManager(t, tn)
			ca, up, dns := cloudflareCA(t, tn, proj)
			p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
			site := siteName{newSite(t, tn)}
			name := site.Name("www")
			c, o := readyOrder(t, p, site, name)

			// Action
			cert := issue(t, c, o, newCSR(t, cnFor(subject.commonName, name), name), upstreamIssuance)

			// Assert
			require.Equal(t, []string{name}, cert.DNSNames)
			dns.ExpectEvent[cloudflare.DNSRecordCreated](t, func(e cloudflare.DNSRecordCreated) bool { return e.Name == "_acme-challenge."+name })
			dns.ExpectEvent[cloudflare.DNSRecordDeleted](t, func(e cloudflare.DNSRecordDeleted) bool { return e.Name == "_acme-challenge."+name })
			require.Len(t, up.State(t).Issued, 1)
		})

		t.Run("should issue from the upstream CA after answering DNS-01 in DNS Made Easy "+subject.name, func(t *testing.T) {
			t.Parallel()
			spec.Why(t, `DNS Made Easy record names are relative to the zone and Infisical always writes
				_acme-challenge, so the identifier here is the zone apex, the one case that name is right
				for. TestAcmeExternalCA_KnownIssues covers a name below the apex.`)

			// Setup
			tn := h.NewTenant(t)
			proj := pki.CertManager(t, tn)
			site := siteName{newSite(t, tn)}
			ca, up, dns := dnsMadeEasyCA(t, tn, proj, site.Domain())
			p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
			name := site.Domain()
			c, o := readyOrder(t, p, site, name)

			// Action
			cert := issue(t, c, o, newCSR(t, cnFor(subject.commonName, name), name), upstreamIssuance)

			// Assert
			require.Equal(t, []string{name}, cert.DNSNames)
			dns.ExpectEvent[dnsmadeeasy.RecordCreated](t, func(e dnsmadeeasy.RecordCreated) bool { return e.Type == "TXT" && e.Name == "_acme-challenge" })
			dns.ExpectEvent[dnsmadeeasy.RecordDeleted](t, func(e dnsmadeeasy.RecordDeleted) bool { return e.Type == "TXT" && e.Name == "_acme-challenge" })
			require.Len(t, up.State(t).Issued, 1)
		})
	}

	t.Run("should refuse a CSR whose names the policy does not allow, before ordering upstream", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := cloudflareCA(t, tn, proj)
		withCertificateKey(t, proj)

		rows := []struct {
			name      string
			cn        string
			sans      []string
			emptySANs bool
			detail    string
		}{
			{"when the common name is not allowed and there are no SANs", "www", nil, true, "Invalid CSR: common_name value '%s' is not in allowed values list"},
			{"when the common name is not allowed beside an allowed SAN", "www", []string{"san"}, false, "Invalid CSR: common_name value '%s' is not in allowed values list"},
			{"when the only SAN is not allowed", "", []string{"www"}, false, "Invalid CSR: dns_name SAN value '%s' is not in allowed values list"},
			{"when one SAN is not allowed beside an allowed one", "", []string{"san", "www"}, false, "Invalid CSR: dns_name SAN value '%s' is not in allowed values list"},
			{"when the common name is allowed and one SAN is not", "cn", []string{"san", "www"}, false, "Invalid CSR: dns_name SAN value '%s' is not in allowed values list"},
		}
		for _, row := range rows {
			t.Run(row.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				site := siteName{newSite(t, tn)}
				policy := pki.NewPolicy(t, proj, allowNames(t, site.Name("cn"), site.Name("san")))
				p := newAcmeProfileFrom(t, tn, proj, ca, policy, api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
				c := p.registered(t)
				want := csrSpec{keyType: "RSA-2048", hash: crypto.SHA256, commonName: site.label(row.cn), dnsNames: site.labels(row.sans), emptySANs: row.emptySANs}
				o := c.NewOrder(t, want.names()...)
				passHTTP01(t, c, site.ControlPlane, o.Authorizations)
				waitOrder(t, c, o.URL, "ready")

				// Action
				res := c.Finalize(t, o.Finalize, buildCSR(t, want))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "badCSR", fmt.Sprintf(row.detail, site.Name("www")))
				require.Empty(t, up.State(t).Issued)
			})
		}
	})

	t.Run("should refuse a CSR whose key or signature algorithm the policy does not allow, before ordering upstream", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := cloudflareCA(t, tn, proj)
		withCertificateKey(t, proj)

		rows := []struct {
			allowedKey, allowedSignature, keyType string
			hash                                  crypto.Hash
			detail                                string
		}{
			{"RSA-4096", "SHA512-RSA", "RSA-2048", crypto.SHA512, "Invalid CSR: Key algorithm 'RSA_2048' is not allowed by this policy"},
			{"RSA-4096", "SHA512-RSA", "RSA-3072", crypto.SHA512, "Invalid CSR: Key algorithm 'RSA_3072' is not allowed by this policy"},
			{"RSA-4096", "ECDSA-SHA512", "ECDSA-P256", crypto.SHA512, "Invalid CSR: Key algorithm 'EC_prime256v1' is not allowed by this policy"},
			{"RSA-4096", "ECDSA-SHA512", "ECDSA-P384", crypto.SHA512, "Invalid CSR: Key algorithm 'EC_secp384r1' is not allowed by this policy"},
			{"RSA-4096", "ECDSA-SHA512", "ECDSA-P521", crypto.SHA512, "Invalid CSR: Key algorithm 'EC_secp521r1' is not allowed by this policy"},
			{"RSA-2048", "SHA512-RSA", "RSA-2048", crypto.SHA384, "Invalid CSR: Signature algorithm 'RSA-SHA384' is not allowed by this policy"},
			{"RSA-2048", "SHA512-RSA", "RSA-2048", crypto.SHA256, "Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by this policy"},
			{"ECDSA-P256", "SHA512-RSA", "ECDSA-P256", crypto.SHA256, "Invalid CSR: Signature algorithm 'ECDSA-SHA256' is not allowed by this policy"},
			{"ECDSA-P384", "SHA512-RSA", "ECDSA-P384", crypto.SHA256, "Invalid CSR: Signature algorithm 'ECDSA-SHA256' is not allowed by this policy"},
			{"ECDSA-P521", "SHA512-RSA", "ECDSA-P521", crypto.SHA256, "Invalid CSR: Signature algorithm 'ECDSA-SHA256' is not allowed by this policy"},
			{"RSA-2048", "SHA512-RSA", "RSA-4096", crypto.SHA256, "Invalid CSR: Signature algorithm 'RSA-SHA256' is not allowed by this policy, Key algorithm 'RSA_4096' is not allowed by this policy"},
		}
		for _, row := range rows {
			t.Run(row.keyType+" "+row.hash.String()+" against "+row.allowedKey+" "+row.allowedSignature, func(t *testing.T) {
				t.Parallel()

				// Setup
				body := pki.AllowAll(t)
				body.Algorithms.Signature = &[]string{row.allowedSignature}
				body.Algorithms.KeyAlgorithm = &[]string{row.allowedKey}
				p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, body), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
				site := siteName{newSite(t, tn)}
				c, o := readyOrder(t, p, site, site.Name("www"))

				// Action
				res := c.Finalize(t, o.Finalize, buildCSR(t, csrSpec{keyType: row.keyType, hash: row.hash, dnsNames: []string{site.Name("www")}}))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "badCSR", row.detail)
				require.Empty(t, up.State(t).Issued)
			})
		}
	})
}

func TestAcmeExternalCA_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should name the DNS Made Easy challenge record after the identifier when it is below the zone apex", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `DNS Made Easy record names are relative to the zone, so the DNS-01 record for
			www.<zone> is _acme-challenge.www. Infisical always writes _acme-challenge
			(getAcmeChallengeRecord in acme-certificate-authority-fns.ts), which is the record for the
			apex, so a CA that checks DNS never finds the record for any other name.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		site := siteName{newSite(t, tn)}
		ca, _, dns := dnsMadeEasyCA(t, tn, proj, site.Domain())
		p := newAcmeProfileFrom(t, tn, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t)), api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{})
		c, o := readyOrder(t, p, site, site.Name("www"))

		// Action
		c.Finalize(t, o.Finalize, newCSR(t, "", site.Name("www")))

		// Assert
		created := dns.ExpectEvent[dnsmadeeasy.RecordCreated](t, nil, fakenet.Within(upstreamWait))
		require.Equal(t, "_acme-challenge.www", created.Name)
	})
}
