package externalca_test

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

func TestVenafiTppCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew by submitting a new request for the certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, tpp := venafiTppCA(t, tn, proj)
		o := newOrderIssuer(t, proj, ca)
		name := id.Short() + ".venafi.test"
		certID, _ := o.issue(t, pki.ServerCertificate(name))

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		stored := tpp.State(t).Certificates[venafiPolicyDN+`\`+name]
		require.NotNil(t, stored)
		require.Equal(t, 2, stored.Requests)
		require.Equal(t, pki.ParseLeaf(t, stored.PEM).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})

	t.Run("should refuse to revoke, which Venafi TPP CAs do not support, and keep the certificate active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, _ := venafiTppCA(t, tn, proj)
		o := newOrderIssuer(t, proj, ca)
		certID, _ := o.issue(t, pki.ServerCertificate(id.Short()+".venafi.test"))

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Certificate revocation is not supported by this certificate authority type", apierr.Message(res.Body))
		require.Equal(t, "active", o.certificateStatus(t, certID))
	})
}
