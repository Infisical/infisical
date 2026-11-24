package externalca_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/venafitpp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

const venafiPolicyDN = `\VED\Policy\Harness`

func venafiTppCA(t *testing.T, tn *harness.Tenant, proj *pki.Project) (pki.CA, *venafitpp.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.VenafiTppOAuthAppConnection)
	tpp := venafitpp.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	body := api.CreateVenafiTppCertificateAuthorityV1JSONRequestBody{
		ProjectId: &proj.ID,
		Name:      "venafi-" + id.Short(),
		Status:    api.CreateVenafiTppCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.PolicyDN = venafiPolicyDN
	res, err := tn.Admin.API.CreateVenafiTppCertificateAuthorityV1WithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a Venafi TPP CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return pki.CA{ID: res.JSON200.Id}, tpp
}

func TestVenafiTppCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue under the CA's policy after polling retrieve, then revoke the token it used", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, tpp := venafiTppCA(t, tn, proj)
		o := newOrderIssuer(t, proj, ca)
		name := id.Short() + ".venafi.test"
		mark := tpp.Mark(t)

		// Action
		res := o.order(t, pki.ServerCertificate(name))

		// Assert
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, tpp.State(t).Root)))
		stored := tpp.State(t).Certificates[venafiPolicyDN+`\`+name]
		require.NotNil(t, stored)
		require.Equal(t, 2, stored.Retrievals)
		tpp.ExpectEvent[venafitpp.TokenRevoked](t, nil, fakenet.Since(mark))
	})
}
