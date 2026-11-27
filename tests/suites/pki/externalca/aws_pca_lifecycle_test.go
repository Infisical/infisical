package externalca_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

type pcaRig struct {
	pki.AwsPcaCA
	o orderIssuer
}

func newPcaRig(t *testing.T, tn *harness.Tenant) pcaRig {
	t.Helper()
	proj := pki.CertManager(t, tn)
	pca := pki.NewAwsPcaCA(t, proj)
	return pcaRig{AwsPcaCA: pca, o: newOrderIssuer(t, proj, pca.CA)}
}

func TestAwsPcaCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew with a new certificate the Private CA signed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newPcaRig(t, tn)
		certID, first := r.o.issue(t, pki.ServerCertificate(id.Short()+".pca.test"))

		// Action
		got := r.o.Settled(t, r.o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.NotEqual(t, pki.ParseLeaf(t, *first.JSON200.Certificate).SerialNumber, leaf.SerialNumber)
		authority := r.Acct.ACMPCA.State(t).Authorities[r.ARN]
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, authority.Certificate)))
		require.Len(t, authority.Issued, 2)
	})

	t.Run("should revoke the certificate at the Private CA with its serial and reason", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newPcaRig(t, tn)
		certID, got := r.o.issue(t, pki.ServerCertificate(id.Short()+".pca.test"))
		serial := pki.ParseLeaf(t, *got.JSON200.Certificate).SerialNumber.Text(16)

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		r.Acct.ACMPCA.ExpectEvent[aws.PrivateCertificateRevoked](t, func(e aws.PrivateCertificateRevoked) bool {
			return e.Serial == serial && e.Reason == "KEY_COMPROMISE"
		})
	})

	t.Run("should refuse to point the CA at a Private CA that is not active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		r := newPcaRig(t, tn)
		inactive := aws.PrivateCAARN(r.Conn.Nonce())
		r.Acct.Seed(t, aws.SeedPrivateCA(inactive, "DISABLED"))

		// Action
		res, err := tn.Admin.API.UpdateAwsPcaCertificateAuthorityV1WithBodyWithResponse(t.Context(), r.ID.String(), "application/json",
			bytes.NewReader(jsonBody(t, map[string]any{"configuration": map[string]any{
				"appConnectionId": r.Conn.ID, "certificateAuthorityArn": inactive, "region": "us-east-1"}})))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "AWS Private CA '"+inactive+"' is not ACTIVE (current status: DISABLED)", apierr.Message(res.Body))
		got, err := tn.Admin.API.GetAwsPcaCertificateAuthorityV1WithResponse(t.Context(), r.ID.String())
		require.NoError(t, err)
		require.Equal(t, r.ARN, decode(t, got.Body)["configuration"].(map[string]any)["certificateAuthorityArn"])
	})
}
