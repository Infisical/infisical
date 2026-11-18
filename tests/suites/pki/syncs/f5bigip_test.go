package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/f5bigip"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestF5BigIpPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should install the ssl-cert and ssl-key objects from the uploaded files, remove the uploads and save the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.F5BigIpBasicAuthAppConnection)
		bigip := f5bigip.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		path := "/Common/" + applianceObjectName(cert)
		body := api.CreateF5BigIpPkiSyncJSONRequestBody{
			Name:           "f5-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateF5BigIpPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetF5BigIpPkiSync, syncID, nil)
		state := bigip.State(t)
		require.Equal(t, strings.TrimSpace(cert.Certificate), strings.TrimSpace(state.SSLCerts[path]))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(state.SSLKeys[path]))
		require.Contains(t, state.Saved, "ssl-cert "+path)
		require.Contains(t, state.Saved, "ssl-key "+path)
		require.Empty(t, state.Downloads)
	})
}
