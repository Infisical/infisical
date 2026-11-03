package insights_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// A new organization is created with value tracking on, so search works without
// enabling it first.
func TestSecretSearchByValue(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stop finding a rotated value and find the new one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "ROTATES", "the-old-value")
		require.Len(t, searchByValue(t, tn.Admin, "the-old-value"), 1)

		// Action
		secretmanager.UpdateSecret(t, proj, "dev", "ROTATES", "the-new-value")

		// Assert
		require.Empty(t, searchByValue(t, tn.Admin, "the-old-value"))
		require.Equal(t, []string{"dev/ROTATES"}, wheres(searchByValue(t, tn.Admin, "the-new-value")))
	})

	t.Run("should keep a renamed secret findable by the value it still holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "BEFORE_RENAME", "survives-a-rename")

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "BEFORE_RENAME", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", NewSecretName: new("AFTER_RENAME"),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "renaming: %s", apierr.Body(res.Body))
		require.Equal(t, []string{"dev/AFTER_RENAME"}, wheres(searchByValue(t, tn.Admin, "survives-a-rename")))
	})

	t.Run("should not find a deleted secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "TEMPORARY", "here-then-gone")
		require.Len(t, searchByValue(t, tn.Admin, "here-then-gone"), 1)

		// Action
		secretmanager.DeleteSecret(t, proj, "dev", "TEMPORARY")

		// Assert
		require.Empty(t, searchByValue(t, tn.Admin, "here-then-gone"))
	})

	t.Run("should find a value in every project, environment and folder that holds it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		second := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, first, "dev", "/nested")
		secretmanager.CreateSecret(t, first, "dev", "IN_FIRST_ROOT", "shared-value")
		secretmanager.CreateSecret(t, first, "dev", "IN_FIRST_NESTED", "shared-value", secretmanager.WithPath("/nested"))
		secretmanager.CreateSecret(t, first, "prod", "IN_FIRST_PROD", "shared-value")
		secretmanager.CreateSecret(t, second, "dev", "IN_SECOND_PROJECT", "shared-value")
		secretmanager.CreateSecret(t, second, "dev", "DIFFERENT_VALUE", "other-value")

		// Action
		got := searchByValue(t, tn.Admin, "shared-value")

		// Assert
		require.Equal(t, []string{
			"dev/IN_FIRST_ROOT",
			"dev/IN_SECOND_PROJECT",
			"dev/nested/IN_FIRST_NESTED",
			"prod/IN_FIRST_PROD",
		}, wheres(got))
		projects := map[string]bool{}
		for _, f := range got {
			projects[f.ProjectID] = true
		}
		require.Equal(t, map[string]bool{first.ID: true, second.ID: true}, projects)
	})

	t.Run("should not find a value held in another organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		otherProj := fixture.NewProject(t, other, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, otherProj, "dev", "OTHER_ORG", "value-in-a-different-org")
		require.Len(t, searchByValue(t, other.Admin, "value-in-a-different-org"), 1)

		// Action
		got := searchByValue(t, tn.Admin, "value-in-a-different-org")

		// Assert
		require.Empty(t, got)
	})
}

func TestSecretValueTracking(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse enabling org-wide value tracking when the organization already has it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.EnableOrgWideSecretValueTrackingWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret value search is already enabled for this organization", res.JSON400.Message)
		status, err := tn.Admin.API.GetOrgWideSecretValueTrackingStatusWithResponse(t.Context())
		require.NoError(t, err)
		require.NotNilf(t, status.JSON200, "reading the status returned %d: %s", status.StatusCode(), apierr.Body(status.Body))
		require.Equal(t, "completed", string(status.JSON200.Status))
	})

	t.Run("should refuse enabling the project blind index when the project already has it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.EnableProjectSecretBlindIndexWithResponse(t.Context(), proj.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret blind indexing is already enabled for this project", res.JSON400.Message)
		status, err := tn.Admin.API.GetProjectSecretBlindIndexStatusWithResponse(t.Context(), proj.ID)
		require.NoError(t, err)
		require.NotNilf(t, status.JSON200, "reading the status returned %d: %s", status.StatusCode(), apierr.Body(status.Body))
		require.Equal(t, "completed", string(status.JSON200.Status))
	})
}
