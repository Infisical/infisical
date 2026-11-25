package externalca_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// issueGoDaddy orders a certificate, proves domain control and triggers validation, and
// returns the issued certificate and GoDaddy's id for it.
func issueGoDaddy(t *testing.T, tn *harness.Tenant, o orderIssuer, gd *godaddy.ControlPlane, name string) (uuid.UUID, string) {
	t.Helper()
	res := o.order(t, pki.ServerCertificate(name))
	pending := o.Settled(t, res.JSON200.CertificateRequestId, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
	require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, pending.JSON200.Status, "error: %v", pending.JSON200.ErrorMessage)
	var ordered *godaddy.Certificate
	for _, c := range gd.State(t).Certificates {
		ordered = c
	}
	require.NotNil(t, ordered)
	fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, ordered.DomainToken)
	trigger(t, tn, res.JSON200.CertificateRequestId)
	got := o.Settled(t, res.JSON200.CertificateRequestId)
	require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
	certID, err := uuid.Parse(*got.JSON200.CertificateId)
	require.NoError(t, err)
	return certID, ordered.ID
}

// trigger runs validation of a pending request as the Product Admin, who alone may.
func trigger(t *testing.T, tn *harness.Tenant, requestID string) {
	t.Helper()
	reqID, err := uuid.Parse(requestID)
	require.NoError(t, err)
	res, err := tn.Admin.API.TriggerCertificateRequestValidationWithResponse(t.Context(), reqID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "triggering validation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func TestGoDaddyCA_Lifecycle(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should renew the same GoDaddy certificate inside its renewal window", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := pki.NewGoDaddyCA(t, proj)
		gd.Seed(t, godaddy.WithValidityDays(20))
		o := newOrderIssuer(t, proj, ca)
		name := id.Short() + ".godaddy.test"
		certID, godaddyID := issueGoDaddy(t, tn, o, gd, name)
		before := gd.State(t).Certificates[godaddyID].Serial

		// Action
		reqID := o.renew(t, certID, map[string]any{})
		pending := o.Settled(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, pending.JSON200.Status, "error: %v", pending.JSON200.ErrorMessage)
		trigger(t, tn, reqID)

		// Assert
		got := o.Settled(t, reqID)
		require.Equalf(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		state := gd.State(t)
		require.Len(t, state.Certificates, 1)
		renewed := state.Certificates[godaddyID]
		require.Equal(t, 1, renewed.Renewals)
		require.NotEqual(t, before, renewed.Serial)
		require.Equal(t, pki.ParseLeaf(t, renewed.PEM).Raw, pki.ParseLeaf(t, *got.JSON200.Certificate).Raw)
	})

	t.Run("should fail a renewal outside the renewal window with GoDaddy's message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := pki.NewGoDaddyCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		certID, godaddyID := issueGoDaddy(t, tn, o, gd, id.Short()+".godaddy.test")

		// Action
		got := o.Settled(t, o.renew(t, certID, map[string]any{}))

		// Assert
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusFailed, got.JSON200.Status)
		require.NotNil(t, got.JSON200.ErrorMessage)
		require.Equal(t, "Certificate issuance failed: GoDaddy certificate renewal for "+godaddyID+" failed: The certificate can only be renewed from 60 days before to 30 days after it expires (RENEWAL_NOT_ALLOWED)", *got.JSON200.ErrorMessage)
		require.Zero(t, gd.State(t).Certificates[godaddyID].Renewals)
	})

	t.Run("should revoke the certificate at GoDaddy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := pki.NewGoDaddyCA(t, proj)
		o := newOrderIssuer(t, proj, ca)
		certID, godaddyID := issueGoDaddy(t, tn, o, gd, id.Short()+".godaddy.test")

		// Action
		res := pki.RevokeRequest(t, tn.Admin, certID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		gd.ExpectEvent[godaddy.CertificateRevoked](t, func(e godaddy.CertificateRevoked) bool {
			return e.CertificateID == godaddyID && e.Reason == "KEY_COMPROMISE"
		})
		require.Equal(t, "REVOKED", gd.State(t).Certificates[godaddyID].Status)
	})
}
