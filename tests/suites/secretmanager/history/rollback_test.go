package history_test

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

func TestFolderCommit_Rollback(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	valuesAt := func(t *testing.T, proj *fixture.Project, folderPath string) map[string]string {
		t.Helper()
		values := map[string]string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev", secretmanager.WithPath(folderPath)) {
			values[s.Key] = s.Value
		}
		return values
	}

	rollbackRole := func(t *testing.T, proj *fixture.Project) *harness.Principal {
		t.Helper()
		proj.NewRole(t, "root-rollback",
			fixture.Permission{Subject: "commits", Action: []string{"read"}},
			fixture.Permission{
				Subject:    "commits",
				Action:     []string{"perform-rollback"},
				Conditions: map[string]any{"secretPath": map[string]any{"$eq": "/"}},
			})
		return proj.NewUser(t, fixture.WithPrincipalName("roller"), fixture.WithRoles("root-rollback"))
	}

	t.Run("should restore values, additions and removals in the folder only, and record a rollback commit with the counts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "KEEP", "original")
		secretmanager.CreateSecret(t, proj, "dev", "REMOVED", "original")
		target := headCommit(t, proj, "dev", "/")
		secretmanager.UpdateSecret(t, proj, "dev", "KEEP", "changed")
		secretmanager.DeleteSecret(t, proj, "dev", "REMOVED")
		secretmanager.CreateSecret(t, proj, "dev", "ADDED", "new")
		secretmanager.CreateSecret(t, proj, "dev", "NESTED", "new", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.RollbackFolderCommitWithResponse(t.Context(), target.ID, api.RollbackFolderCommitJSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", FolderId: folderID(t, proj, "dev", "/"), Message: new("restore before release"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "rollback returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, new(float32(3)), res.JSON200.SecretChangesCount)
		require.Equal(t, new(float32(0)), res.JSON200.FolderChangesCount)
		require.Equal(t, new(float32(3)), res.JSON200.TotalChanges)
		require.Equal(t, map[string]string{"KEEP": "original", "REMOVED": "original"}, valuesAt(t, proj, "/"))
		require.Equal(t, map[string]string{"NESTED": "new"}, valuesAt(t, proj, "/app"))
		head := headCommit(t, proj, "dev", "/")
		require.Equal(t, "restore before release", head.Message)
		require.Equal(t, commit{ID: head.ID, Message: head.Message, Actor: "user", Secrets: 3, Added: 1, Updated: 1, Deleted: 1}, head)
	})

	t.Run("should refuse a rollback to a commit from another folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "NESTED", "v", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "dev", "ROOT", "v")
		appCommit := headCommit(t, proj, "dev", "/app")

		// Action
		res, err := rollback(t, tn.Admin, proj, "dev", folderID(t, proj, "dev", "/"), appCommit.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "Target commit not found", apierr.Message(res.Body))
		require.Equal(t, map[string]string{"ROOT": "v"}, valuesAt(t, proj, "/"))
	})

	t.Run("should refuse a deep rollback without perform-rollback on the subtree", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		roller := rollbackRole(t, proj)
		secretmanager.CreateSecret(t, proj, "dev", "ROOT", "original")
		target := headCommit(t, proj, "dev", "/")
		secretmanager.UpdateSecret(t, proj, "dev", "ROOT", "changed")
		before := commitsAt(t, proj.Tenant().Admin, proj, "dev", "/")

		// Action
		res, err := rollback(t, roller, proj, "dev", folderID(t, proj, "dev", "/"), target.ID, true)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, map[string]string{"ROOT": "changed"}, valuesAt(t, proj, "/"))
		require.Equal(t, before, commitsAt(t, proj.Tenant().Admin, proj, "dev", "/"))
	})

	t.Run("should allow a shallow rollback with perform-rollback on the folder alone", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		roller := rollbackRole(t, proj)
		secretmanager.CreateSecret(t, proj, "dev", "ROOT", "original")
		target := headCommit(t, proj, "dev", "/")
		secretmanager.UpdateSecret(t, proj, "dev", "ROOT", "changed")

		// Action
		res, err := rollback(t, roller, proj, "dev", folderID(t, proj, "dev", "/"), target.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, map[string]string{"ROOT": "original"}, valuesAt(t, proj, "/"))
	})
}
