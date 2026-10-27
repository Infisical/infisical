package settings_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestProject_Settings(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a settings edit without the settings permission and keep the name", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.UpdateProjectWithResponse(t.Context(), proj.ID,
			api.UpdateProjectJSONRequestBody{Name: new("renamed")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to edit on settings", res.JSON403.Message)
		require.Equal(t, proj.Name, projectName(t, proj))
	})

	t.Run("should refuse deleting a project while delete protection is on and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		updated, err := tn.Admin.API.UpdateProjectWithResponse(t.Context(), proj.ID,
			api.UpdateProjectJSONRequestBody{HasDeleteProtection: new(true)})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, updated.StatusCode(), "turning on delete protection: %s", apierr.Body(updated.Body))

		// Action
		res, err := tn.Admin.API.DeleteProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "Project delete protection is enabled", res.JSON403.Message)
		require.Equal(t, proj.Name, projectName(t, proj))
	})

	t.Run("should delete a project once delete protection is turned off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		for _, protect := range []bool{true, false} {
			updated, err := tn.Admin.API.UpdateProjectWithResponse(t.Context(), proj.ID,
				api.UpdateProjectJSONRequestBody{HasDeleteProtection: new(protect)})
			require.NoError(t, err)
			require.Equalf(t, http.StatusOK, updated.StatusCode(), "setting delete protection: %s", apierr.Body(updated.Body))
		}

		// Action
		res, err := tn.Admin.API.DeleteProjectWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetProjectByIdWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, got.StatusCode())
	})
}
