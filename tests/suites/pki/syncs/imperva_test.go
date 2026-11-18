package syncs_test

import (
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestImpervaPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should set the certificate as the website's custom certificate for its key type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.ImpervaAPIKeyAppConnection)
		cp := imperva.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		cp.Seed(t, imperva.WithSite("4242", "shop", pki.ParseLeaf(t, cert.Certificate).DNSNames...))
		body := api.CreateImpervaPkiSyncJSONRequestBody{
			Name:           "imperva-" + id.Short(),
			ConnectionId:   conn.ID,
			ApplicationId:  &g.App.ID,
			CertificateIds: &[]uuid.UUID{cert.ID},
		}
		body.DestinationConfig.SiteId = "4242"

		// Action
		res, err := tn.Admin.API.CreateImpervaPkiSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		syncID := res.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetImpervaPkiSync, syncID, nil)
		site := cp.State(t).Sites["4242"]
		require.Len(t, site.Certificates, 1)
		uploaded := site.Certificates["RSA"]
		require.NotNil(t, uploaded, "the RSA slot should hold the certificate")
		require.True(t, strings.HasPrefix(uploaded.Certificate, strings.TrimSpace(cert.Certificate)))
		require.Equal(t, strings.TrimSpace(cert.PrivateKey), strings.TrimSpace(uploaded.PrivateKey))
		require.False(t, uploaded.MismatchSite)
	})
}
