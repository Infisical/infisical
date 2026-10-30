package folders_test

import (
	"fmt"
	"net/http"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestFolder_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a duplicate folder name naming the path and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")

		// Action
		res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "api", Path: new("/app"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Folder with name 'api' already exists in path '/app'", res.JSON400.Message)
		require.Equal(t, []string{"api"}, folderNames(t, proj, "dev", "/app"))
	})

	t.Run("should create every missing parent when a nested path is given", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "api", Path: new("/app/backend"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "/app/backend/api", res.JSON200.Folder.Path)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"backend"}, folderNames(t, proj, "dev", "/app"))
		require.Equal(t, []string{"api"}, folderNames(t, proj, "dev", "/app/backend"))
	})

	t.Run("should keep one folder when the same folder is created concurrently", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		const attempts = 10

		// Action
		statuses := make([]int, attempts)
		var wg sync.WaitGroup
		for i := range attempts {
			wg.Go(func() {
				res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
					ProjectId: proj.ID, Environment: "dev", Name: "api", Path: new("/app/backend"),
				})
				if err == nil {
					statuses[i] = res.StatusCode()
				}
			})
		}
		wg.Wait()

		// Assert
		created, refused := 0, 0
		for _, s := range statuses {
			switch s {
			case http.StatusOK:
				created++
			case http.StatusBadRequest:
				refused++
			}
		}
		require.Equal(t, 1, created, "statuses: %v", statuses)
		require.Equal(t, attempts-1, refused, "statuses: %v", statuses)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		require.Equal(t, []string{"api"}, folderNames(t, proj, "dev", "/app/backend"))
	})

	t.Run("should refuse a name with a space, dot or slash with the naming-rule message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		for _, name := range []string{"my app", "my.app", "my/app"} {
			// Action
			res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Name: name,
			})

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "name %q: %s", name, res.Body)
			require.Contains(t, string(res.Body),
				"Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed.")
		}
		require.Empty(t, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should refuse an unknown environment naming the slug", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "qa", Name: "app",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, fmt.Sprintf("Environment with slug 'qa' in project with ID '%s' not found", proj.ID),
			res.JSON404.Message)
	})

	t.Run("should return the description the folder was created with", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "app", Description: new("payments service"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "creating returned %d: %s", res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON200.Folder.Description)
		require.Equal(t, "payments service", *res.JSON200.Folder.Description)
		got, err := tn.Admin.API.GetSecretFolderByIdWithResponse(t.Context(), res.JSON200.Folder.Id.String())
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading returned %d: %s", got.StatusCode(), got.Body)
		require.NotNil(t, got.JSON200.Folder.Description)
		require.Equal(t, "payments service", *got.JSON200.Folder.Description)
	})

	t.Run("should refuse a viewer and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.CreateSecretFolderWithResponse(t.Context(), api.CreateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "app",
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create on secret-folders", res.JSON403.Message)
		require.Empty(t, folderNames(t, proj, "dev", "/"))
	})
}
