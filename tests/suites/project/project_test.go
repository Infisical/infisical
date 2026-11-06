package project_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
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
