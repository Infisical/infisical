package scheduled_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/digicert"
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

type orderer struct{ pki.Orderer }

func newOrderer(t *testing.T, proj *pki.Project, ca pki.CA) orderer {
	t.Helper()
	return orderer{pki.NewOrderer(t, proj, pki.NewProfile(t, proj, ca, pki.NewPolicy(t, proj, pki.AllowAll(t))))}
}

// order requests a certificate and waits for the request to reach one of want, returning
// the request's id and the settled request.
func (o orderer) order(t *testing.T, name string, want ...api.GetCertificateRequest200JSONResponseBodyStatus) (string, *api.GetCertificateRequestResponse) {
	t.Helper()
	res := pki.Request(t, o.Operator, o.App, o.Profile, pki.ServerCertificate(name))
	require.NotNilf(t, res.JSON200, "ordering a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	got := o.Settled(t, res.JSON200.CertificateRequestId, want...)
	require.Contains(t, want, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
	return res.JSON200.CertificateRequestId, got
}

func TestOrderPollingJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should issue a pending DigiCert order once its domain control record is published", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		o := newOrderer(t, proj, ca)
		name := "www." + id.Short() + ".digicert.test"
		requestID, _ := o.order(t, name, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		var placed *digicert.Order
		for _, ord := range dc.State(t).Orders {
			placed = ord
		}
		require.NotNil(t, placed)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, placed.DCVRandomValue)

		// Action
		runJob(t, h, api.DigicertOrderPolling)

		// Assert
		got := o.Settled(t, requestID)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, dc.State(t).Root)))
	})

	t.Run("should leave a DigiCert order pending while its domain control is unproven", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, _ := pki.NewDigiCertCA(t, proj)
		o := newOrderer(t, proj, ca)
		requestID, _ := o.order(t, "www."+id.Short()+".digicert.test", api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)

		// Action
		runJob(t, h, api.DigicertOrderPolling)

		// Assert
		got := o.Settled(t, requestID, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
	})

	t.Run("should issue a pending GoDaddy order once its domain control record is published", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, gd := pki.NewGoDaddyCA(t, proj)
		o := newOrderer(t, proj, ca)
		name := id.Short() + ".godaddy.test"
		requestID, _ := o.order(t, name, api.GetCertificateRequest200JSONResponseBodyStatusPendingValidation)
		var ordered *godaddy.Certificate
		for _, c := range gd.State(t).Certificates {
			ordered = c
		}
		require.NotNil(t, ordered)
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_dnsauth."+name, ordered.DomainToken)

		// Action
		runJob(t, h, api.GodaddyOrderPolling)

		// Assert
		got := o.Settled(t, requestID)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusIssued, got.JSON200.Status, "error: %v", got.JSON200.ErrorMessage)
		leaf := pki.ParseLeaf(t, *got.JSON200.Certificate)
		require.Equal(t, name, leaf.Subject.CommonName)
		require.NoError(t, leaf.CheckSignatureFrom(pki.ParseLeaf(t, gd.State(t).Root)))
	})
}

func TestDigiCertRevocationSyncJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should mark a certificate revoked when DigiCert reports its order revoked", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		ca, dc := pki.NewDigiCertCA(t, proj)
		domain := id.Short() + ".digicert.test"
		dc.Seed(t, digicert.WithValidatedDomain(domain))
		o := newOrderer(t, proj, ca)
		revoked := o.issued(t, "www."+domain)
		kept := o.issued(t, "api."+domain)
		dc.Seed(t, digicert.RevokeOrder(orderFor(t, dc, "www."+domain)))

		// Action
		runJob(t, h, api.DigicertRevocationSync)

		// Assert
		require.Equal(t, "revoked", pki.ReadCertificate(t, o.Operator, revoked).JSON200.Certificate.Status)
		require.Equal(t, "active", pki.ReadCertificate(t, o.Operator, kept).JSON200.Certificate.Status)
	})
}

// issued orders a certificate the CA issues at once and returns its id.
func (o orderer) issued(t *testing.T, name string) uuid.UUID {
	t.Helper()
	_, got := o.order(t, name, api.GetCertificateRequest200JSONResponseBodyStatusIssued)
	require.NotNil(t, got.JSON200.CertificateId)
	certID, err := uuid.Parse(*got.JSON200.CertificateId)
	require.NoError(t, err)
	return certID
}

func orderFor(t *testing.T, dc *digicert.ControlPlane, commonName string) int {
	t.Helper()
	for _, ord := range dc.State(t).Orders {
		if ord.CommonName == commonName {
			return ord.ID
		}
	}
	require.FailNow(t, "no DigiCert order for "+commonName)
	return 0
}
