package project_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestProject_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create the project in the caller's organization with default environments", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateProjectWithResponse(t.Context(), api.CreateProjectJSONRequestBody{
			ProjectName: "app",
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating a project returned %d: %s", res.StatusCode(), res.Body)
		proj := res.JSON200.Project
		require.Equal(t, tn.OrgID, proj.OrgId)

		// The response is the only place a caller learns the environment slugs.
		var envs []string
		for _, e := range proj.Environments {
			envs = append(envs, e.Slug)
		}
		require.Subset(t, envs, []string{"dev", "staging", "prod"})
	})
}

func TestProject_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hide project settings from a no-access member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		updated, err := tn.Admin.API.UpdateProjectWithResponse(t.Context(), proj.ID,
			api.UpdateProjectJSONRequestBody{SecretDetectionIgnoreValues: &[]string{"not-a-secret"}})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, updated.StatusCode(), "updating the project: %s", updated.Body)
		noAccess := proj.NewUser(t, fixture.WithRoles("no-access"))

		// Action
		res, err := noAccess.API.GetProjectByIdWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the project returned %d: %s", res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Project.Environments, len(proj.Environments))
		require.Nil(t, res.JSON200.Project.SecretDetectionIgnoreValues)
	})
}
