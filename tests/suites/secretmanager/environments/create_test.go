package environments_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestEnvironment_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should start a new project with development, staging and production in that order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Assert
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should place a new environment last and hold secrets in it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: "qa"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "QA", res.JSON200.Environment.Name)
		require.Equal(t, proj.ID, res.JSON200.Environment.ProjectId)
		require.Equal(t, float32(4), res.JSON200.Environment.Position)
		require.Equal(t, []string{"dev", "staging", "prod", "qa"}, readEnvs(t, proj).active)
		secretmanager.CreateSecret(t, proj, "qa", "API_KEY", "value")
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "qa", "API_KEY").Value)
	})

	t.Run("should shift the other environments when one is created at a position", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: "qa", Position: new(float32(2))})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, float32(2), res.JSON200.Environment.Position)
		require.Equal(t, []string{"dev", "qa", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should refuse a duplicate slug and keep the environments", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "Another staging", Slug: "staging"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Environment with slug already exists", res.JSON400.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	for name, tc := range map[string]struct{ slug, message string }{
		"invalid":  {"Not A Slug", "Slug field can only contain lowercase letters, numbers, and hyphens"},
		"too long": {strings.Repeat("a", 65), "Slug field must be at most 64 lowercase characters"},
	} {
		t.Run("should refuse a slug that is "+name+" and create nothing", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

			// Action
			res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
				api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: tc.slug})

			// Assert
			require.NoError(t, err)
			require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
			require.Contains(t, string(res.Body), tc.message)
			require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
		})
	}

	t.Run("should refuse a create past the plan's environment limit and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.EnvironmentLimit, 3)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: "qa"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			"Failed to create environment due to environment limit reached. Upgrade plan to create more environments.",
			res.JSON400.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})

	t.Run("should refuse a viewer and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.CreateEnvironmentWithResponse(t.Context(), proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "QA", Slug: "qa"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on environments", res.JSON403.Message)
		require.Equal(t, []string{"dev", "staging", "prod"}, readEnvs(t, proj).active)
	})
}
