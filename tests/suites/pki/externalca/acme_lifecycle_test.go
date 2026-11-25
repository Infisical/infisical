package externalca_test

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

func TestAcmeCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew through a new order at the upstream CA", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := pki.NewCloudflareAcmeCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		certID, _ := o.issue(t, pki.ServerCertificate(id.Short()+".order.test"))

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		issued := up.State(t).Issued
		require.Len(t, issued, 2)
		require.NotEqual(t, issued[0].OrderID, issued[1].OrderID)
		require.Equal(t, pki.ParseLeaf(t, issued[1].PEM).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})
}

func TestAcmeCA_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should revoke the certificate at the upstream CA when it is revoked in Infisical", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `ACME lists revocation among its capabilities, but revoking never calls the upstream
			CA's revokeCert (ACME is missing from the upstream dispatch in certificate-service.ts), so
			a certificate revoked for key compromise stays valid at the CA that issued it.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, up, _ := pki.NewCloudflareAcmeCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		certID, _ := o.issue(t, pki.ServerCertificate(id.Short()+".order.test"))

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		require.Equal(t, "revoked", o.certificateStatus(t, certID))
		require.NotNil(t, up.State(t).Issued[0].RevokedAt, "the upstream CA should hold the certificate revoked")
	})
}
