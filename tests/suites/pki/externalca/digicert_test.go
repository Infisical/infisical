package externalca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestDigiCertCA_Issue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue in the job when every name is under a domain the account already validated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		domain := id.Short() + ".digicert.test"
		dc.Seed(t, digicert.WithValidatedDomain(domain))
		o := newOrderIssuer(t, proj, ca)

		// Action
		res := o.order(t, pki.ServerCertificate("www."+domain))

		// Assert
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, "www."+domain, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, dc.State(t).Root)))
	})

	t.Run("should wait for validation and issue once the TXT record is in place and validation is triggered", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		name := "www." + id.Short() + ".digicert.test"
		o := newOrderIssuer(t, proj, ca)
		res := o.order(t, pki.ServerCertificate(name))
		pending := o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, pending.JSON200.Status, "error: %v", pending.JSON200.ErrorMessage)
		var placed *digicert.Order
		for _, ord := range dc.State(t).Orders {
			placed = ord
		}
		require.NotNil(t, placed)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, placed.DCVRandomValue)

		// Action
		trig, err := tn.Admin.API.TriggerCertificateRequestValidationWithResponse(t.Context(), orderRequestID(t, res))

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, trig.JSON200, "triggering validation returned %d: %s", trig.StatusCode(), apierr.Body(trig.Body))
		got := o.Settled(t, res.JSON200.CertificateRequestId)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		require.Equal(t, name, pki.ParseLeaf(t, *got.JSON200.Certificate).Subject.CommonName)
	})

	t.Run("should refuse the operator who placed the order when they trigger validation", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] An operator issues, renews and revokes inside the application, but triggering
			validation checks the project-wide certificates edit permission, which a Product Member does not
			have, so only a Product Admin can finish a pending DigiCert or GoDaddy order.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, _ := pki.NewDigiCertCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		res := o.order(t, pki.ServerCertificate("www."+id.Short()+".digicert.test"))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation).JSON200.Status)

		// Action
		trig, err := o.Operator.API.TriggerCertificateRequestValidationWithResponse(t.Context(), orderRequestID(t, res))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, trig.StatusCode())
		require.Equal(t, "You are not allowed to edit on certificates", apierr.Message(trig.Body))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation).JSON200.Status)
	})
}
