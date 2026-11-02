package environments_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestEnvironment_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should make secrets unreachable and list the environment as pending deletion once it is soft-deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "value")

		// Action
		res, err := tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "staging"), nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON200.Environment.DeleteAfter)
		envs := readEnvs(t, proj)
		require.Equal(t, []string{"dev", "prod"}, envs.active)
		require.Equal(t, []string{"staging"}, envs.deleted)
		read, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("staging")})
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, read.StatusCode())
	})

	t.Run("should remove an environment for good when it is hard-deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		id := createEnv(t, proj, "temp")

		// Action
		res, err := tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, id,
			&api.DeleteEnvironmentParams{HardDelete: new(api.DeleteEnvironmentParamsHardDeleteTrue)})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "temp", res.JSON200.Environment.Slug)
		require.Equal(t, float32(4), res.JSON200.Environment.Position)
		envs := readEnvs(t, proj)
		require.Equal(t, []string{"dev", "staging", "prod"}, envs.active)
		require.Empty(t, envs.deleted)
	})

	t.Run("should refuse re-creating the slug of a pending-deletion environment, naming the hard-delete step", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		deleteEnv(t, proj, envID(t, proj, "staging"), false)

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "Staging", Slug: "staging"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Environment slug 'staging' is held by a pending-deletion environment. Permanently delete that environment first, then retry.",
			res.JSON400.Message)
		require.Equal(t, []string{"dev", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should free the slug at once when the pending-deletion environment is hard-deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		staging := envID(t, proj, "staging")
		secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "old")
		deleteEnv(t, proj, staging, false)
		deleteEnv(t, proj, staging, true)

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "Staging", Slug: "staging"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		envs := readEnvs(t, proj)
		require.Equal(t, []string{"dev", "prod", "staging"}, envs.active)
		require.Empty(t, envs.deleted)
		require.Empty(t, secretmanager.ListSecrets(t, proj, "staging"))
	})

	t.Run("should refuse deleting an environment that an approval policy uses and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "staging", Path: "/"}, reviewer)

		// Action
		res, err := tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "staging"), nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Environment is in use by a secret approval policy", res.JSON400.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should refuse a viewer and keep the environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.DeleteEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "staging"), nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to delete on environments", res.JSON403.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})
}
