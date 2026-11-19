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

func TestGoDaddyCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should wait for validation and issue once domain control is proven and validation is triggered", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := pki.NewGoDaddyCA(t, proj)
		name := id.Short() + ".godaddy.test"
		o := newOrderIssuer(t, proj, ca)
		res := o.order(t, pki.ServerCertificate(name))
		pending := o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
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
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, gd.State(t).Root)))
	})
}
