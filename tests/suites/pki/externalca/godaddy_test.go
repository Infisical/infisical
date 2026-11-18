package externalca_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func godaddyCA(t *testing.T, tn *harness.Tenant, proj *pki.Project) (pki.CA, *godaddy.ControlPlane) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.GoDaddyAPIKeyAppConnection)
	gd := godaddy.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	body := api.CreateGodaddyCertificateAuthorityV1JSONRequestBody{
		ProjectId: &proj.ID,
		Name:      "godaddy-" + id.Short(),
		Status:    api.CreateGodaddyCertificateAuthorityV1JSONBodyStatusActive,
	}
	body.Configuration.AppConnectionId = conn.ID
	body.Configuration.ProductType = api.CreateGodaddyCertificateAuthorityV1JSONBodyConfigurationProductTypeDVSSL
	res, err := tn.Admin.API.CreateGodaddyCertificateAuthorityV1WithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a GoDaddy CA returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return pki.CA{ID: res.JSON200.Id}, gd
}

func TestGoDaddyCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should wait for validation and issue once domain control is proven and validation is triggered", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := godaddyCA(t, tn, proj)
		name := id.Short() + ".godaddy.test"
		o := newOrderIssuer(t, tn, proj, ca)
		res := o.order(t, pki.ServerCertificate(name))
		pending := o.settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, pending.JSON200.Status, "error: %v", pending.JSON200.ErrorMessage)
		var ordered *godaddy.Certificate
		for _, c := range gd.State(t).Certificates {
			ordered = c
		}
		require.NotNil(t, ordered)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, ordered.DomainToken)

		// Action
		trig, err := tn.Admin.API.TriggerCertificateRequestValidationWithResponse(t.Context(), orderRequestID(t, res))

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, trig.JSON200, "triggering validation returned %d: %s", trig.StatusCode(), apierr.Body(trig.Body))
		got := o.settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, gd.State(t).Root)))
	})
}
