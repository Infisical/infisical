package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGcpCertificateManagerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create the certificate in the configured project and location and wait for its operation to finish", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.GCPServiceAccountAppConnection(tn))
		gcp := oauth.OpenGCP(t, conn.FakenetAdmin(t), fixture.GCPServiceAccountEmail(tn, conn.Nonce()))
		project := "proj-" + strings.ToLower(id.Short())
		body := api.CreateGcpCertificateManagerPkiSyncJSONRequestBody{
			Name:           "gcp-" + id.Short(),
			ConnectionId:   conn.ID,
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.GcpProjectId = project
		body.DestinationConfig.Location = "us-central1"
		body.SyncOptions.CertificateNameSchema = "infisical-{{certificateId}}"

		// Action
		res, err := tn.Admin.API.CreateGcpCertificateManagerPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetGcpCertificateManagerPkiSync, syncID, nil)
		state := gcp.CertificateManager.State(t)
		require.Len(t, state.Certificates, 1)
		for name, created := range state.Certificates {
			require.True(t, strings.HasPrefix(name, "projects/"+project+"/locations/us-central1/certificates/"), "created at %s", name)
			require.True(t, strings.HasPrefix(created.PemCertificate, strings.TrimSpace(cert.Certificate)))
			require.Equal(t, "infisical", created.Labels["managed-by"])
			gcp.CertificateManager.ExpectEvent[oauth.GCPCertificateCreated](t, func(e oauth.GCPCertificateCreated) bool { return e.Name == name })
		}
		for name, op := range state.Operations {
			require.Truef(t, op.Done, "Infisical never polled operation %s", name)
		}
	})
}
