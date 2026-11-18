package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kemp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestKempLoadMasterPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should add the certificate with its key and put its issuing CA in the intermediate store", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.KempLoadMasterBasicAuthAppConnection)
		lm := kemp.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		body := api.CreateKempLoadmasterPkiSyncJSONRequestBody{
			Name:           "kemp-" + id.Short(),
			ConnectionId:   conn.ID.String(),
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateKempLoadmasterPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetKempLoadmasterPkiSync, syncID, nil)
		state := lm.State(t)
		bundle := state.Certificates[applianceObjectName(cert)]
		require.True(t, strings.HasPrefix(bundle, strings.TrimSpace(cert.Certificate)))
		require.Contains(t, bundle, strings.TrimSpace(cert.PrivateKey))
		var stored []string
		for _, ca := range state.Intermediates {
			stored = append(stored, strings.TrimSpace(ca))
		}
		require.Equal(t, []string{applianceIntermediate(t, cert)}, stored)
	})
}
