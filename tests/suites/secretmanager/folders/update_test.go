package folders_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolder_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a rename onto a sibling's name and keep both", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		api1 := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/api"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/web")

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), api1.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/app"), Name: "web",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Folder with specified name already exists", res.JSON400.Message)
		require.ElementsMatch(t, []string{"api", "web"}, folderNames(t, proj, "dev", "/app"))
	})

	t.Run("should serve secrets at the new path and not at the old one after a rename", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folderID.String(), api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "service",
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "renaming returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "/service", res.JSON200.Folder.Path)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "API_KEY", secretmanager.WithPath("/service")).Value)
		require.Nil(t, secretKeys(t, proj, "dev", "/app"), "the old path still answers")
	})
}
