package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/nutanix"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNutanixPrismCentralPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should replace the cluster's certificate with the certificate, its chain and key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.NutanixPrismCentralBasicAuthAppConnection)
		pc := nutanix.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		pc.Seed(t, nutanix.WithCluster("cluster-1", "prod"))
		body := api.CreateNutanixPrismCentralPkiSyncJSONRequestBody{
			Name:           "nutanix-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.ClusterId = "cluster-1"
		body.DestinationConfig.ClusterName = "prod"

		// Action
		res, err := tn.Admin.API.CreateNutanixPrismCentralPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetNutanixPrismCentralPkiSync, syncID, nil)
		cluster := pc.State(t).Clusters["cluster-1"]
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(cluster.PublicCertificate))
		require.Equal(t, strings.TrimSpace(cert.Chain), strings.TrimSpace(cluster.CaChain))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(cluster.PrivateKey))
		require.Equal(t, "RSA_2048", cluster.KeyAlgorithm)
		require.Equal(t, 2, cluster.Version, "the PUT should carry the ETag of the certificate it replaced")
	})
}
