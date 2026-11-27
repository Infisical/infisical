package acme_test

import (
	"crypto"
	"net"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAcmeOrder_Finalize(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue without a common name when the CSR names the host only as a SAN", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		name := site.Name("www")
		o := c.NewOrder(t, name)
		passHTTP01(t, c, site, o.Authorizations)
		waitOrder(t, c, o.URL, "ready")

		// Action
		cert := issue(t, c, o, newCSR(t, "", name))

		// Assert
		require.Empty(t, cert.Subject.CommonName)
		require.Equal(t, []string{name}, cert.DNSNames)
	})

	t.Run("should refuse and leave the order ready when the CSR names differ from the order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		o := c.NewOrder(t, site.Name("www"), site.Name("api"))
		passHTTP01(t, c, site, o.Authorizations)
		waitOrder(t, c, o.URL, "ready")

		// Action
		res := c.Finalize(t, o.Finalize, newCSR(t, site.Name("other")))

		// Assert
		requireProblem(t, res, http.StatusBadRequest, "badCSR", "Invalid CSR: Common name + SANs mismatch with order identifiers")
		require.Equal(t, "ready", c.Order(t, o.URL).Status)
	})

	t.Run("should issue a certificate naming only the IP address when the order is for a private IP and verification is skipped", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		policy := pki.AllowAll(t)
		ipSANs := (*policy.Sans)[0]
		ipSANs.Type = api.CreateCertificatePolicyJSONBodySansTypeIpAddress
		*policy.Sans = append(*policy.Sans, ipSANs)
		c := newAcmeProfileFrom(t, tn, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, policy),
			api.SetPkiApplicationAcmeEnrollmentJSONRequestBody{SkipDnsOwnershipVerification: new(true)}).registered(t)
		const ip = "10.20.30.40"
		o := c.NewOrder(t, ip)

		// Action
		cert := issue(t, c, o, buildCSR(t, csrSpec{keyType: "RSA-2048", hash: crypto.SHA256, ips: []net.IP{net.ParseIP(ip)}}))

		// Assert
		require.Equal(t, []identifier{{Type: "ip", Value: ip}}, c.Order(t, o.URL).Identifiers)
		got := make([]string, 0, len(cert.IPAddresses))
		for _, a := range cert.IPAddresses {
			got = append(got, a.String())
		}
		require.Equal(t, []string{ip}, got)
		require.Empty(t, cert.DNSNames)
	})
}
