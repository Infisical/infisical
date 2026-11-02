package folders_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestFolder_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove an empty folder from the list", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		gone := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app/gone"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/kept")

		// Action
		res, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), gone.String(), api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/app"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "deleting returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "gone", res.JSON200.Folder.Name)
		require.Equal(t, []string{"kept"}, folderNames(t, proj, "dev", "/app"))
	})

	for _, content := range []string{"a secret", "a subfolder"} {
		t.Run("should refuse deleting a folder holding "+content+" without forceDelete and delete nothing", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
			if content == "a secret" {
				secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app"))
			} else {
				secretmanager.CreateFolder(t, proj, "dev", "/app/api")
			}

			// Action
			res, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folderID.String(), api.DeleteSecretFolderJSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", Path: new("/"),
			})

			// Assert
			require.NoError(t, err)
			require.Equal(t, http.StatusBadRequest, res.StatusCode())
			require.Equal(t,
				`Cannot delete folder "app" because it contains resources. Use forceDelete=true to delete it forcefully.`,
				res.JSON400.Message)
			require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
		})
	}

	t.Run("should delete the folder and its contents when forceDelete is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app/api"))

		// Action
		res, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folderID.String(), api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", res.Body)
		require.Empty(t, folderNames(t, proj, "dev", "/"))
		require.Nil(t, secretKeys(t, proj, "dev", "/app/api"), "the nested folder still answers")
	})

	t.Run("should refuse deleting a folder that has an open change request and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		committer := proj.NewUser(t, fixture.WithPrincipalName("committer"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app"}, reviewer)
		held, err := committer.API.CreateSecretV4WithResponse(t.Context(), "API_KEY", api.CreateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/app"), SecretValue: "value",
		})
		require.NoError(t, err)
		require.Containsf(t, string(held.Body), `"approval"`, "the write was not held: %s", held.Body)

		// Action
		res, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folderID.String(), api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			`You cannot delete the selected folder because it has open change requests at folder path "/app". Merge or close the change requests and try again.`,
			res.JSON400.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
	})

	t.Run("should refuse deleting a folder whose secrets a policy protects, naming the policy, and keep them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reviewer := proj.NewUser(t, fixture.WithPrincipalName("reviewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateSecret(t, proj, "dev", "API_KEY", "value", secretmanager.WithPath("/app/api"))
		guard := secretmanager.CreateApprovalPolicy(t, proj, secretmanager.Location{Env: "dev", Path: "/app/api"}, reviewer)

		// Action
		res, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folderID.String(), api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`You cannot delete the selected folder because it contains one or more secrets that are protected by the change policy %q at folder path "/app/api". Please remove the secrets at folder path "/app/api" and try again.`, guard),
			res.JSON400.Message)
		require.Equal(t, []string{"API_KEY"}, secretKeys(t, proj, "dev", "/app/api"))
	})

	t.Run("should refuse a viewer and keep the folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))
		folderID := uuid.MustParse(secretmanager.CreateFolder(t, proj, "dev", "/app"))

		// Action
		res, err := viewer.API.DeleteSecretFolderWithResponse(t.Context(), folderID.String(), api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: new("/"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to delete on secret-folders", res.JSON403.Message)
		require.Equal(t, []string{"app"}, folderNames(t, proj, "dev", "/"))
	})
}
