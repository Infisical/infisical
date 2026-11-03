package environments_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestEnvironment_Restore(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should bring an environment and its secrets back, placed last, on restore", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		staging := envID(t, proj, "staging")
		secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "value")
		deleteEnv(t, proj, staging, false)

		// Action
		res, err := tn.Admin.API.RestoreEnvironmentWithResponse(t.Context(), proj.ID, staging)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "restoring returned %d: %s", res.StatusCode(), res.Body)
		require.Nil(t, res.JSON200.Environment.DeleteAfter)
		envs := readEnvs(t, proj)
		require.Equal(t, []string{"dev", "prod", "staging"}, envs.active)
		require.Empty(t, envs.deleted)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "staging", "API_KEY").Value)
	})

	t.Run("should refuse restoring an environment that is not deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		staging := envID(t, proj, "staging")

		// Action
		res, err := tn.Admin.API.RestoreEnvironmentWithResponse(t.Context(), proj.ID, staging)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t,
			"Soft-deleted environment with id '"+staging+"' in project with ID '"+proj.ID+"' not found",
			res.JSON404.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})
}
