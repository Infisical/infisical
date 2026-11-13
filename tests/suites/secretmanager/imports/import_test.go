package imports_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestSecretImport_Order(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// threeImports makes dev:/ import staging:/, prod:/ and prod:/extra, in that order.
	threeImports := func(t *testing.T, proj *fixture.Project) []string {
		t.Helper()
		secretmanager.CreateFolder(t, proj, "prod", "/extra")
		return []string{
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"}),
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"}),
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/extra"}),
		}
	}

	t.Run("should list imports in the order they were created with positions from one", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))

		// Action
		ids := threeImports(t, proj)

		// Assert
		rows := listImports(t, proj, "dev", "/")
		require.Equal(t, ids, importIDs(rows))
		require.Equal(t, []int{1, 2, 3}, positions(rows))
		require.Equal(t, "staging", rows[0].Env)
		require.Equal(t, "/extra", rows[2].Path)
	})

	t.Run("should move an import to a new position and shift the others", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ids := threeImports(t, proj)
		body := api.UpdateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Import.Position = new(float32(3))

		// Action
		res, err := tn.Admin.API.UpdateSecretImportWithResponse(t.Context(), ids[0], body)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, float32(3), res.JSON200.SecretImport.Position)
		rows := listImports(t, proj, "dev", "/")
		require.Equal(t, []string{ids[1], ids[2], ids[0]}, importIDs(rows))
		require.Equal(t, []int{1, 2, 3}, positions(rows))
	})

	t.Run("should close the gap in positions when an import is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ids := threeImports(t, proj)

		// Action
		res, err := tn.Admin.API.DeleteSecretImportWithResponse(t.Context(), ids[1],
			api.DeleteSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "prod", res.JSON200.SecretImport.ImportEnv.Slug)
		rows := listImports(t, proj, "dev", "/")
		require.Equal(t, []string{ids[0], ids[2]}, importIDs(rows))
		require.Equal(t, []int{1, 2}, positions(rows))
	})
}

func TestSecretImport_Errors(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer not found with the generic message when the source environment does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res := importInto(t, tn.Admin, proj, "dev", "/", secretmanager.Location{Env: "nope", Path: "/"})

		// Assert
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "The requested entity is not found", res.JSON404.Message,
			"today the message does not name the environment; a fix that names it updates this claim")
		require.Empty(t, listImports(t, proj, "dev", "/"))
	})

	t.Run("should answer bad request when updating an import that does not exist, while delete answers not found", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		missing := uuid.NewString()
		body := api.UpdateSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"}
		body.Import.Position = new(float32(1))

		// Action
		updated, err := tn.Admin.API.UpdateSecretImportWithResponse(t.Context(), missing, body)
		require.NoError(t, err)
		deleted, err := tn.Admin.API.DeleteSecretImportWithResponse(t.Context(), missing,
			api.DeleteSecretImportJSONRequestBody{ProjectId: proj.ID, Environment: "dev"})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusBadRequest, updated.StatusCode())
		require.Equal(t, "Secret import not found", updated.JSON400.Message)
		require.Equal(t, http.StatusNotFound, deleted.StatusCode())
		require.Equal(t, "Secret import with folder ID '"+missing+"' not found", deleted.JSON404.Message)
	})
}
