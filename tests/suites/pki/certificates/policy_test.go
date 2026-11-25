package certificates_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// allowSANs narrows AllowAll's DNS names to the allowed patterns.
func allowSANs(t *testing.T, allowed ...string) api.CreateCertificatePolicyJSONRequestBody {
	t.Helper()
	body := pki.AllowAll(t)
	(*body.Sans)[0].Allowed = &allowed
	return body
}

// requireRefused checks the operator's request was refused with the message and
// that the profile issued nothing.
func requireRefused(t *testing.T, g *pki.Graph, res *api.CreateCertificateResponse, message string) {
	t.Helper()
	require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	require.Equal(t, message, apierr.Message(res.Body))
	require.Zero(t, pki.Requests(t, g.Project, g.Profile))
}

func TestCertificate_Policy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a DNS name outside the allowed pattern, naming it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn, pki.WithPolicy(allowSANs(t, "*.allowed.test")))
		body := withSAN(pki.ServerCertificate(id.Short()+".allowed.test"), "x.denied.test")

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, body)

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: dns_name SAN value 'x.denied.test' does not match allowed patterns: *.allowed.test")
	})

	t.Run("should refuse a denied DNS name even when an allowed pattern matches it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := allowSANs(t, "*.allowed.test")
		(*policy.Sans)[0].Denied = &[]string{"bad.allowed.test"}
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))
		body := withSAN(pki.ServerCertificate(id.Short()+".allowed.test"), "bad.allowed.test")

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, body)

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: dns_name SAN matching denied pattern 'bad.allowed.test' found in request")
	})

	t.Run("should refuse a request missing a required DNS name, naming it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		(*policy.Sans)[0].Required = &[]string{"required.test"}
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".other.test"))

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: Required dns_name SAN matching pattern 'required.test' not found in request")
	})

	t.Run("should refuse an extended key usage the policy does not allow", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		policy.ExtendedKeyUsages.Allowed = &[]api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowed{api.CreateCertificatePolicyJSONBodyExtendedKeyUsagesAllowedServerAuth}
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))
		body := pki.ServerCertificate(id.Short() + ".eku.test")
		body.Attributes.ExtendedKeyUsages = &[]api.CreateCertificateJSONBodyAttributesExtendedKeyUsages{api.CreateCertificateJSONBodyAttributesExtendedKeyUsagesClientAuth}

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, body)

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: Invalid extended key usages: client_auth")
	})

	t.Run("should refuse a TTL above the policy's maximum", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		policy.Validity.Max = new("30d")
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))
		body := pki.ServerCertificate(id.Short() + ".ttl.test")
		body.Attributes.Ttl = new("90d")

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, body)

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: Requested validity period exceeds maximum allowed duration")
	})

	t.Run("should refuse a key algorithm the policy does not allow", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		policy.Algorithms.KeyAlgorithm = &[]string{"ECDSA-P256"}
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".key.test"))

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: Key algorithm 'RSA_2048' is not allowed by this policy")
	})

	t.Run("should refuse an organization the policy does not allow", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.AllowAll(t)
		var org api.CreateCertificatePolicyJSONBody_Subject_Item
		require.NoError(t, org.FromCreateCertificatePolicyJSONBodySubject0(api.CreateCertificatePolicyJSONBodySubject0{
			Type:    api.CreateCertificatePolicyJSONBodySubject0TypeOrganization,
			Allowed: &[]string{"Allowed Org"},
		}))
		*policy.Subject = append(*policy.Subject, org)
		g := pki.NewGraph(t, tn, pki.WithPolicy(policy))
		body := pki.ServerCertificate(id.Short() + ".org.test")
		body.Attributes.Organization = new("Other Org")

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, body)

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: organization value 'Other Org' is not in allowed values list")
	})

	t.Run("should refuse a CSR naming a DNS name outside the allowed pattern", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn, pki.WithPolicy(allowSANs(t, "*.allowed.test")))
		csr, _ := newCSR(t, "", "x.denied.test")

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, csrRequest(csr))

		// Assert
		requireRefused(t, g, res, "Certificate request validation failed: dns_name SAN value 'x.denied.test' does not match allowed patterns: *.allowed.test")
	})
}
