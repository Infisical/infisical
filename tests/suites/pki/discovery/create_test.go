package discovery_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestPkiDiscovery_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a job with more domains than the limit and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		domains := make([]string, 21)
		for i := range domains {
			domains[i] = targetName()
		}
		body := api.CreatePkiDiscoveryJSONRequestBody{
			ProjectId:     new(proj.ID.String()),
			Name:          "discovery-" + id.Short(),
			DiscoveryType: new(api.CreatePkiDiscoveryJSONBodyDiscoveryTypeNetwork),
		}
		body.TargetConfig.Domains = &domains
		body.TargetConfig.Ports = new("443")

		// Action
		res, err := tn.Admin.API.CreatePkiDiscoveryWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Maximum 20 domains allowed per discovery", apierr.Message(res.Body))
		within := domains[:20]
		body.TargetConfig.Domains = &within
		again, err := tn.Admin.API.CreatePkiDiscoveryWithResponse(t.Context(), body)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, again.StatusCode(), "the refused job's name should still be free: %s", apierr.Body(again.Body))
	})
}
