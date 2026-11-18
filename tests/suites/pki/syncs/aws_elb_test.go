package syncs_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAwsElbPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should attach the certificate it imported into ACM to the listener and leave the default certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		account := aws.AccountID(conn.Nonce())
		lbArn := "arn:aws:elasticloadbalancing:" + aws.Region + ":" + account + ":loadbalancer/app/web/" + id.Short()
		listenerArn := "arn:aws:elasticloadbalancing:" + aws.Region + ":" + account + ":listener/app/web/" + id.Short()
		defaultCert := "arn:aws:acm:" + aws.Region + ":" + account + ":certificate/" + uuid.NewString()
		acct.Seed(t, aws.SeedListener(listenerArn, lbArn, 443, defaultCert))
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

		// Action
		res, err := tn.Admin.API.CreateAwsElasticLoadBalancerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetAwsElasticLoadBalancerPkiSync, syncID, nil)
		imported := acmCertificateFor(t, acct, cert)
		require.NotNil(t, imported, "ACM should hold the certificate")
		acct.ELB.ExpectEvent[aws.ListenerCertificateAdded](t, func(e aws.ListenerCertificateAdded) bool {
			return e.ListenerArn == listenerArn && e.CertificateArn == imported.ARN
		})
		listener := acct.ELB.State(t).Listeners[listenerArn]
		require.Contains(t, listener.Certificates, imported.ARN)
		require.Equal(t, defaultCert, listener.DefaultCertificate)
	})
}
