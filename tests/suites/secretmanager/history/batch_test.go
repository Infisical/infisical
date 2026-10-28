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

func TestFolderCommit_Batch(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	batch := func(proj *fixture.Project, secrets, folders map[string]any) map[string]any {
		return map[string]any{
			"projectId":   proj.ID,
			"environment": "dev",
			"secretPath":  "/",
			"message":     "release prep",
			"changes":     map[string]any{"secrets": secrets, "folders": folders},
		}
	}

	t.Run("should apply secret and folder changes in one commit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "CHANGED", "original")
		secretmanager.CreateSecret(t, proj, "dev", "GONE", "original")
		before := len(commitsAt(t, tn.Admin, proj, "dev", "/"))

		// Action
		res, err := tn.Admin.API.CreateBatchFolderCommitWithBodyWithResponse(t.Context(), "application/json", postJSON(t, batch(proj,
			map[string]any{
				"create": []map[string]any{{"secretKey": "ADDED", "secretValue": "new"}},
				"update": []map[string]any{{"secretKey": "CHANGED", "secretValue": "changed"}},
				"delete": []map[string]any{{"secretKey": "GONE"}},
			},
			map[string]any{"create": []map[string]any{{"folderName": "app"}}},
		)))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		values := map[string]string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev") {
			values[s.Key] = s.Value
		}
		require.Equal(t, map[string]string{"ADDED": "new", "CHANGED": "changed"}, values)
		folders, err := tn.Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{ProjectId: proj.ID, Environment: "dev", Path: "/"})
		require.NoError(t, err)
		require.NotNilf(t, folders.JSON200, "listing folders returned %d: %s", folders.StatusCode(), folders.Body)
		require.Len(t, folders.JSON200.Folders, 1)
		require.Equal(t, "app", folders.JSON200.Folders[0].Name)
		commits := commitsAt(t, tn.Admin, proj, "dev", "/")
		require.Len(t, commits, before+1)
		require.Equal(t, commit{ID: commits[0].ID, Message: "release prep", Actor: "user", Secrets: 3, Added: 2, Updated: 1, Deleted: 1}, commits[0])
	})

	t.Run("should refuse a lowercase key and apply nothing when the project enforces capitalization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		enforced, err := tn.Admin.API.UpdateProjectWithResponse(t.Context(), proj.ID, api.UpdateProjectJSONRequestBody{AutoCapitalization: new(true)})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, enforced.StatusCode(), enforced.Body)
		secretmanager.CreateSecret(t, proj, "dev", "EXISTING", "v")
		before := commitsAt(t, tn.Admin, proj, "dev", "/")

		// Action
		res, err := tn.Admin.API.CreateBatchFolderCommitWithBodyWithResponse(t.Context(), "application/json", postJSON(t, batch(proj,
			map[string]any{"create": []map[string]any{{"secretKey": "lower_key", "secretValue": "v"}, {"secretKey": "UPPER_KEY", "secretValue": "v"}}},
			map[string]any{"create": []map[string]any{{"folderName": "app"}}},
		)))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Secret names must be in UPPERCASE per project requirements: lower_key. You can disable this requirement in project settings",
			apierr.Message(res.Body))
		keys := []string{}
		for _, s := range secretmanager.ListSecrets(t, proj, "dev") {
			keys = append(keys, s.Key)
		}
		require.Equal(t, []string{"EXISTING"}, keys)
		require.Equal(t, before, commitsAt(t, tn.Admin, proj, "dev", "/"))
	})
}
