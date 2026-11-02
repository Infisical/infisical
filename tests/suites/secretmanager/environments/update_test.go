package environments_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestEnvironment_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should rename, re-slug and move an environment to the requested position", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		id := createEnv(t, proj, "temp")

		// Action
		res, err := tn.Admin.API.UpdateEnvironmentWithResponse(t.Context(), proj.ID, id, api.UpdateEnvironmentJSONRequestBody{
			Name: new("temp#2"), Slug: new("temp2"), Position: new(float32(1)),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, id, res.JSON200.Environment.Id.String())
		require.Equal(t, "temp#2", res.JSON200.Environment.Name)
		require.Equal(t, "temp2", res.JSON200.Environment.Slug)
		require.Equal(t, float32(1), res.JSON200.Environment.Position)
		require.Equal(t, []string{"temp2", "dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should serve an environment's secrets under its new slug and not the old one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "API_KEY", "value")

		// Action
		res, err := tn.Admin.API.UpdateEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "staging"),
			api.UpdateEnvironmentJSONRequestBody{Slug: new("stage")})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "stage", "API_KEY").Value)
		old, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "API_KEY",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("staging")})
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, old.StatusCode())
	})

	t.Run("should refuse a re-slug onto another environment's slug and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.UpdateEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "staging"),
			api.UpdateEnvironmentJSONRequestBody{Slug: new("prod")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Environment with slug already exists", res.JSON400.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should refuse renaming an environment, naming the limit, when a downgrade leaves the project over the environment limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		createEnv(t, proj, "qa")
		tn.SetPlan(t, license.Enterprise().With(license.EnvironmentLimit, 3))

		// Action
		res, err := tn.Admin.API.UpdateEnvironmentWithResponse(t.Context(), proj.ID, envID(t, proj, "qa"),
			api.UpdateEnvironmentJSONRequestBody{Name: new("Quality")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Failed to update environment due to environment limit exceeded. To update an environment, please upgrade your plan or remove unused environments.",
			res.JSON400.Message)
		require.Equal(t, "qa", readEnvs(t, proj).names["qa"])
	})
}
