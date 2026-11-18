package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestChefPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should write a data bag item holding the certificate, its chain and its key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.ChefUserKeyAppConnection(t))
		cp := chef.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		cp.Seed(t, chef.WithDataBag("certificates"))
		body := api.CreateChefPkiSyncJSONRequestBody{
			Name:           "chef-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.DataBagName = "certificates"
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateChefPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetChefPkiSync, syncID, nil)
		items := cp.State(t).DataBags["certificates"]
		require.Len(t, items, 1)
		for name, item := range items {
			require.Equal(t, name, item["id"])
			require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(item["certificate"].(string)))
			require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(item["private_key"].(string)))
			require.Contains(t, item["certificate_chain"], strings.TrimSpace(cloudFirstPEM(t, cert.Chain)))
		}
	})
}
