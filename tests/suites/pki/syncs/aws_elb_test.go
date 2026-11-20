package syncs_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// elbSync is an auto-syncing ELB sync attaching the graph's certificates to one HTTPS
// listener that serves defaultCert.
type elbSync struct {
	id          string
	get         cloudSyncGet
	acct        *aws.ControlPlane
	conn        *fixture.AppConnection
	listenerArn string
	defaultCert string
}

// newELBSync creates the sync over a new AWS connection and a seeded listener; prepare
// runs on the account before Infisical is handed the sync, to seed or deny something.
func newELBSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, prepare func(*aws.ControlPlane), cert pki.Certificate) elbSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	account := aws.AccountID(conn.Nonce())
	lbArn := "arn:aws:elasticloadbalancing:" + aws.Region + ":" + account + ":loadbalancer/app/web/" + id.Short()
	listenerArn := "arn:aws:elasticloadbalancing:" + aws.Region + ":" + account + ":listener/app/web/" + id.Short()
	defaultCert := "arn:aws:acm:" + aws.Region + ":" + account + ":certificate/" + uuid.NewString()
	acct.Seed(t, aws.SeedListener(listenerArn, lbArn, 443, defaultCert))
	if prepare != nil {
		prepare(acct)
	}
	body := api.CreateAwsElasticLoadBalancerPkiSyncJSONRequestBody{
		Name:           "elb-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.Region = api.CreateAwsElasticLoadBalancerPkiSyncJSONBodyDestinationConfigRegionUsEast1
	body.DestinationConfig.LoadBalancerArn = lbArn
	body.DestinationConfig.Listeners = []struct {
		ListenerArn  string `json:"listenerArn"`
		Port         int    `json:"port"`
		Protocol     string `json:"protocol"`
		SetAsDefault *bool  `json:"setAsDefault,omitempty"`
	}{{ListenerArn: listenerArn, Port: 443, Protocol: "HTTPS"}}
	res, err := tn.Admin.API.CreateAwsElasticLoadBalancerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return elbSync{
		id:          res.JSON200.Id.String(),
		get:         tn.Admin.API.GetAwsElasticLoadBalancerPkiSync,
		acct:        acct,
		conn:        conn,
		listenerArn: listenerArn,
		defaultCert: defaultCert,
	}
}

func (s elbSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncAwsElasticLoadBalancerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestAwsElbPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should attach the certificate it imported into ACM to the listener and leave the default certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newELBSync(t, tn, g, nil, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		imported := acmCertificateFor(t, s.acct, cert)
		require.NotNil(t, imported, "ACM should hold the certificate")
		s.acct.ELB.ExpectEvent[aws.ListenerCertificateAdded](t, func(e aws.ListenerCertificateAdded) bool {
			return e.ListenerArn == s.listenerArn && e.CertificateArn == imported.ARN
		})
		listener := s.acct.ELB.State(t).Listeners[s.listenerArn]
		require.Contains(t, listener.Certificates, imported.ARN)
		require.Equal(t, s.defaultCert, listener.DefaultCertificate)
	})

	t.Run("should keep the listener bound to the same ARN when a renewed certificate is reimported over it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newELBSync(t, tn, g, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		arn := acmCertificateFor(t, s.acct, cert).ARN
		mark := s.acct.ELB.Mark(t)

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.acct.ACM.ExpectEvent[aws.CertificateImported](t, func(e aws.CertificateImported) bool { return e.ARN == arn && e.Reimported })
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, pki.ParseLeaf(t, s.acct.Certificates(t)[arn].Certificate).Raw)
		require.Equal(t, []string{arn}, s.acct.ELB.State(t).Listeners[s.listenerArn].Certificates)
		s.acct.ELB.ExpectNoEvent[aws.ListenerCertificateAdded](t, nil, fakenet.Since(mark))
	})
}

func TestAwsElbPkiSync_RemoveCertificates(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should unbind the certificate from the listener before deleting it from ACM", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Infisical waits 10 seconds between unbinding and deleting, for the listener
			change to propagate, so the delete is awaited for longer than the default. The order is
			checked on the times the fakes record, which share one clock.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newELBSync(t, tn, g, nil, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		arn := acmCertificateFor(t, s.acct, cert).ARN
		mark := s.acct.ACM.Mark(t)

		// Action
		res, err := tn.Admin.API.RemoveAwsElasticLoadBalancerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		unbound := s.acct.ELB.ExpectEvent[aws.ListenerCertificateRemoved](t, func(e aws.ListenerCertificateRemoved) bool {
			return e.ListenerArn == s.listenerArn && e.CertificateArn == arn
		}, fakenet.Since(mark), cloudSyncRemoval)
		deleted := s.acct.ACM.ExpectEvent[aws.CertificateDeleted](t, func(e aws.CertificateDeleted) bool { return e.ARN == arn },
			fakenet.Since(mark), fakenet.Within(20*time.Second))
		require.True(t, deleted.At.After(unbound.At), "the certificate was deleted from ACM at %s, before it was unbound at %s", deleted.At, unbound.At)
		listener := s.acct.ELB.State(t).Listeners[s.listenerArn]
		require.Empty(t, listener.Certificates)
		require.Equal(t, s.defaultCert, listener.DefaultCertificate)
		require.Empty(t, s.acct.Certificates(t))
	})
}

func TestAwsElbPkiSync_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should mark the sync and the certificate failed, with the destination's reason, when the listener refuses the certificate", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The ELB sync records a listener failure under "<certificate name> -> <listener ARN>",
			which matches no certificate, so the sync reports success while the listener never
			serves the certificate.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newELBSync(t, tn, g, func(a *aws.ControlPlane) { a.Seed(t, aws.Deny(aws.ELB, "AddListenerCertificates")) }, cert)

		// Assert
		cloudSyncAwait(t, s.get, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: User: arn:aws:iam::"+aws.AccountID(s.conn.Nonce())+":user/infisical is not authorized to perform: "+
			"elasticloadbalancing:AddListenerCertificates because no identity-based policy allows the elasticloadbalancing:AddListenerCertificates action", failureMessage(t, tn, s.id))
		require.Empty(t, s.acct.ELB.State(t).Listeners[s.listenerArn].Certificates)
	})
}
