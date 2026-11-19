package orgintegration_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func githubOrgSyncBody() api.CreateGithubOrgSyncConfigJSONRequestBody {
	return api.CreateGithubOrgSyncConfigJSONRequestBody{GithubOrgName: "acme", GithubOrgAccessToken: new("ghp_harness")}
}

func requireNoGithubOrgSync(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.GetGithubOrgSyncConfigWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
}

func TestGithubOrgSync_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer 404 when the organization has no GitHub org sync config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetGithubOrgSyncConfigWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "GitHub organization sync config missing")
	})

	t.Run("should refuse a config when the plan does not include GitHub org sync and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.GithubOrgSync)))

		// Action
		res, err := tn.Admin.API.CreateGithubOrgSyncConfigWithResponse(t.Context(), githubOrgSyncBody())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "plan restriction")
		requireNoGithubOrgSync(t, tn)
	})

	t.Run("should refuse a member without permission to configure GitHub org sync and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.CreateGithubOrgSyncConfigWithResponse(t.Context(), githubOrgSyncBody())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		requireNoGithubOrgSync(t, tn)
	})
}
