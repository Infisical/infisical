package certificates_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificate_Renew(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a new certificate for the same subject and names and keep the original readable", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".renew.test"
		original := g.Issue(t, pki.ServerCertificate(name))

		// Action
		res := pki.Renew(t, g.Operator, original.ID, map[string]any{})

		// Assert
		require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotEqual(t, original.ID.String(), res.JSON200.CertificateId)
		require.NotEqual(t, original.SerialNumber, res.JSON200.SerialNumber)
		renewed := pki.ParseLeaf(t, res.JSON200.Certificate)
		require.Equal(t, name, renewed.Subject.CommonName)
		require.Equal(t, []string{name}, renewed.DNSNames)
		require.Equal(t, original.SerialNumber, pki.ReadCertificate(t, g.Operator, original.ID).JSON200.Certificate.SerialNumber)
	})

	t.Run("should issue the renewal on the key of the CSR it is given", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".renew.test"
		original := g.Issue(t, pki.ServerCertificate(name))
		csr, pub := newCSR(t, name, name)

		// Action
		res := pki.Renew(t, g.Operator, original.ID, map[string]any{"renewalKeySource": "csr", "csr": csr})

		// Assert
		require.NotNilf(t, res.JSON200, "renewing returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.True(t, pub.Equal(pki.ParseLeaf(t, res.JSON200.Certificate).PublicKey))
	})

	t.Run("should refuse to renew a revoked certificate and record no renewal", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, adminRevokesWhy)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		original := g.Issue(t, pki.ServerCertificate(id.Short()+".renew.test"))
		pki.Revoke(t, tn.Admin, original, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Action
		res := pki.Renew(t, g.Operator, original.ID, map[string]any{})

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "Certificate is not eligible for renewal: Certificate status is revoked, must be active, Certificate is revoked and cannot be renewed", apierr.Message(res.Body))
		require.Nil(t, pki.ReadCertificate(t, g.Operator, original.ID).JSON200.Certificate.RenewedByCertificateId)
	})

	t.Run("should refuse a renewal the policy no longer allows after it was narrowed, and leave the original unrenewed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".wide.test"
		original := g.Issue(t, pki.ServerCertificate(name))
		narrowed := api.UpdateCertificatePolicyJSONRequestBody{}
		narrowed.Sans = &[]struct {
			Allowed  *[]string                                   `json:"allowed,omitempty"`
			Denied   *[]string                                   `json:"denied,omitempty"`
			Required *[]string                                   `json:"required,omitempty"`
			Type     api.UpdateCertificatePolicyJSONBodySansType `json:"type"`
		}{{Type: api.UpdateCertificatePolicyJSONBodySansTypeDnsName, Allowed: &[]string{"*.allowed.test"}}}
		upd, err := tn.Admin.API.UpdateCertificatePolicyWithResponse(t.Context(), g.Policy.ID, narrowed)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, upd.StatusCode(), "narrowing the policy: %s", apierr.Body(upd.Body))

		// Action
		res := pki.Renew(t, g.Operator, original.ID, map[string]any{})

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
		require.Equal(t, "Certificate renewal failed. Errors: dns_name SAN value '"+name+"' does not match allowed patterns: *.allowed.test", apierr.Message(res.Body))
		require.Nil(t, pki.ReadCertificate(t, g.Operator, original.ID).JSON200.Certificate.RenewedByCertificateId)
	})
}
