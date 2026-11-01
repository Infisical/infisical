package orgintegration_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestWorkflowIntegration(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list no workflow integrations for a new organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.ListWorkflowIntegrationsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, *res.JSON200)
	})

	t.Run("should refuse a member without settings create starting a Slack install", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.GetSlackInstallUrlWithResponse(t.Context(), &api.GetSlackInstallUrlParams{Slug: "alerts"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	t.Run("should list no Microsoft Teams integrations for a new organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.ListMicrosoftTeamsIntegrationsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, *res.JSON200)
	})

	t.Run("should refuse a member without settings create listing Microsoft Teams integrations", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.ListMicrosoftTeamsIntegrationsWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
	})

	t.Run("should refuse the Microsoft Teams client id when the instance has no Teams app, naming why", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetMicrosoftTeamsClientIdWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Microsoft Teams app ID is not set")
	})
}
