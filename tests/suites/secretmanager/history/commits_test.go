package history_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestFolderCommit_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should record a commit with the right message for each secret and folder write", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		root := new("/")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_PASS", "second")
		secretmanager.DeleteSecret(t, proj, "dev", "DB_PASS")
		folder := secretmanager.CreateFolder(t, proj, "dev", "/app")
		renamed, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), folder, api.UpdateSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Name: "api", Path: root,
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, renamed.StatusCode(), renamed.Body)
		deleted, err := tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folder, api.DeleteSecretFolderJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", Path: root,
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, deleted.StatusCode(), deleted.Body)

		// Assert
		require.Equal(t, []string{
			"Folder deleted", "Folder updated", "Folder created", "Secret Deleted", "Secret Updated", "Secret Created",
		}, messages(commitsAt(t, tn.Admin, proj, "dev", "/")))
	})

	t.Run("should page and filter commits by actor type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		identity := proj.NewMachineIdentity(t, fixture.WithRoles("member"))
		secretmanager.CreateSecret(t, proj, "dev", "BY_USER_1", "v")
		secretmanager.CreateSecret(t, proj, "dev", "BY_USER_2", "v")
		secretmanager.CreateSecret(t, proj, "dev", "BY_IDENTITY", "v", secretmanager.As(identity))

		// Action
		page, err := tn.Admin.API.ListFolderCommitsWithResponse(t.Context(), &api.ListFolderCommitsParams{
			ProjectId: proj.ID, Environment: "dev", Limit: new(float32(2)), Offset: new(float32(0)),
		})
		require.NoError(t, err)
		byIdentity, err := tn.Admin.API.ListFolderCommitsWithResponse(t.Context(), &api.ListFolderCommitsParams{
			ProjectId: proj.ID, Environment: "dev", ActorType: new(api.ListFolderCommitsParamsActorTypeIdentity),
		})
		require.NoError(t, err)

		// Assert
		require.NotNilf(t, page.JSON200, "listing a page returned %d: %s", page.StatusCode(), page.Body)
		require.Len(t, page.JSON200.Commits, 2)
		require.Equal(t, float32(3), page.JSON200.Total)
		require.True(t, page.JSON200.HasMore)
		require.NotNilf(t, byIdentity.JSON200, "filtering by actor returned %d: %s", byIdentity.StatusCode(), byIdentity.Body)
		require.Len(t, byIdentity.JSON200.Commits, 1)
		require.Equal(t, "identity", byIdentity.JSON200.Commits[0].ActorType)
		require.Equal(t, float32(1), byIdentity.JSON200.Total)
	})

	t.Run("should refuse comparing a commit with a folder it does not belong to", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "v")
		rootCommit := headCommit(t, proj, "dev", "/")
		other := secretmanager.CreateFolder(t, proj, "dev", "/app")

		// Action
		res, err := tn.Admin.API.CompareFolderCommitWithResponse(t.Context(), rootCommit.ID, &api.CompareFolderCommitParams{
			ProjectId: proj.ID, FolderId: other,
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, fmt.Sprintf("Commit with ID '%s' does not belong to folder with ID '%s'", rootCommit.ID, other),
			apierr.Message(res.Body))
	})
}
