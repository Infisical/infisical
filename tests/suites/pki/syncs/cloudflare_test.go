package syncs_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// cloudflareSync syncs one certificate to a Cloudflare zone, and returns its get route
// and the zone's fake.
func cloudflareSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, cert pki.Certificate) (cloudSyncGet, *cloudflare.ControlPlane, string) {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.CloudflareAPITokenAppConnection)
	zone := id.Nonce()
	cf := cloudflare.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	cf.Seed(t, cloudflare.WithZone(zone))

	body := api.CreateCloudflareCustomCertificatePkiSyncJSONRequestBody{
		Name:           "cloudflare-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &[]uuid.UUID{cert.ID},
	}
	body.DestinationConfig.ZoneId = zone
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	res, err := tn.Admin.API.CreateCloudflareCustomCertificatePkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return tn.Admin.API.GetCloudflareCustomCertificatePkiSync, cf, res.JSON200.Id.String()
}

func TestCloudflareCustomCertificatePkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should upload the certificate as an SNI custom certificate for its names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		get, cf, syncID := cloudflareSync(t, tn, g, cert)

		// Assert
		cloudSyncSucceeded(t, get, syncID, nil)
		var uploaded []cloudflare.CustomCertificate
		for _, certs := range cf.State(t).CustomCertificates {
			uploaded = append(uploaded, certs...)
		}
		require.Len(t, uploaded, 1)
		require.Equal(t, "sni_custom", uploaded[0].Type)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).DNSNames, uploaded[0].Hosts)
		require.Contains(t, uploaded[0].Certificate, strings.TrimSpace(cert.Certificate))
	})

	t.Run("should update the uploaded certificate in place instead of adding a second one when the sync runs again", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		get, cf, syncID := cloudflareSync(t, tn, g, cert)
		first := cloudSyncSucceeded(t, get, syncID, nil)
		mark := cf.Mark(t)

		// Action
		res, err := tn.Admin.API.SyncCloudflareCustomCertificatePkiSyncWithResponse(t.Context(), syncID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
		cloudSyncSucceeded(t, get, syncID, first.LastSyncedAt)
		cf.ExpectEvent[cloudflare.CustomCertificateUpdated](t, nil, fakenet.Since(mark))
		var uploaded []cloudflare.CustomCertificate
		for _, certs := range cf.State(t).CustomCertificates {
			uploaded = append(uploaded, certs...)
		}
		require.Len(t, uploaded, 1)
		require.Equal(t, 1, uploaded[0].Updates)
	})
}
