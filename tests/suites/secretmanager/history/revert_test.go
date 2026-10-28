package history_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestFolderCommit_Revert(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	keys := func(t *testing.T, proj *fixture.Project) []string {
		t.Helper()
		out := []string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev") {
			out = append(out, s.Key)
		}
		return out
	}

	t.Run("should refuse reverting the first commit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FIRST", "v")
		first := headCommit(t, proj, "dev", "/")

		// Action
		res, err := tn.Admin.API.RevertFolderCommitWithResponse(t.Context(), first.ID, api.RevertFolderCommitJSONRequestBody{ProjectId: proj.ID})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Cannot revert the first commit", apierr.Message(res.Body))
		require.Equal(t, []string{"FIRST"}, keys(t, proj))
		require.Len(t, commitsAt(t, tn.Admin, proj, "dev", "/"), 1)
	})

	t.Run("should report no changes when a commit's changes are already undone", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FIRST", "v")
		secretmanager.CreateSecret(t, proj, "dev", "UNDONE", "v")
		created := headCommit(t, proj, "dev", "/")
		secretmanager.DeleteSecret(t, proj, "dev", "UNDONE")

		// Action
		res, err := tn.Admin.API.RevertFolderCommitWithResponse(t.Context(), created.ID, api.RevertFolderCommitJSONRequestBody{ProjectId: proj.ID})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "revert returned %d: %s", res.StatusCode(), res.Body)
		require.True(t, res.JSON200.Success)
		require.Equal(t, "No changes to revert", res.JSON200.Message)
		require.Nil(t, res.JSON200.RevertCommitId)
		require.Equal(t, []string{"FIRST"}, keys(t, proj))
		require.Len(t, commitsAt(t, tn.Admin, proj, "dev", "/"), 3)
	})

	t.Run("should undo only the reverted change and return the previous head, not the new revert commit, as revertCommitId", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] revertCommitId is read before the revert commit is written, so it names
			the head the revert replaced. A fix is planned; it updates this claim.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "FIRST", "v")
		secretmanager.CreateSecret(t, proj, "dev", "REVERTED", "v")
		reverted := headCommit(t, proj, "dev", "/")
		secretmanager.CreateSecret(t, proj, "dev", "LATER", "v")
		previousHead := headCommit(t, proj, "dev", "/")

		// Action
		res, err := tn.Admin.API.RevertFolderCommitWithResponse(t.Context(), reverted.ID, api.RevertFolderCommitJSONRequestBody{ProjectId: proj.ID})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "revert returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, new(float32(1)), res.JSON200.ChangesReverted)
		require.ElementsMatch(t, []string{"FIRST", "LATER"}, keys(t, proj))
		require.Equal(t, new(previousHead.ID), res.JSON200.RevertCommitId)
		head := headCommit(t, proj, "dev", "/")
		require.NotEqual(t, previousHead.ID, head.ID)
		require.Equal(t, "Revert commit changes", head.Message)
	})
}
