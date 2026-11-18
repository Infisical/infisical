package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/netscaler"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestNetScalerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a certkey from the uploaded certificate and key files and save the config holding it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.NetScalerBasicAuthAppConnection)
		adc := netscaler.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		name := applianceObjectName(cert)
		body := api.CreateNetscalerPkiSyncJSONRequestBody{
			Name:           "netscaler-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateNetscalerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetNetscalerPkiSync, syncID, nil)
		state := adc.State(t)
		require.Equal(t, &netscaler.CertKey{Cert: "/nsconfig/ssl/" + name + ".cer", Key: "/nsconfig/ssl/" + name + ".key"}, state.CertKeys[name])
		require.True(t, strings.HasPrefix(state.Files["/nsconfig/ssl/"+name+".cer"], strings.TrimSpace(cert.Certificate)))
		require.Contains(t, state.Files["/nsconfig/ssl/"+name+".cer"], applianceIntermediate(t, cert))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(state.Files["/nsconfig/ssl/"+name+".key"]))
		require.Contains(t, state.Saved, name)
	})
}
