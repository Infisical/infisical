package history_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// checkpointWindow is the backend's default PIT_CHECKPOINT_WINDOW: a folder gets a new
// checkpoint once this many commits have landed since its last one.
const checkpointWindow = 100

func TestFolderCommit_PersonalOverride(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	const personalValue = "owner-personal-override-value"

	// withCheckpointedOverride stores the owner's override in /, then pushes the folder past
	// a checkpoint so the override existed when the checkpoint was taken. It returns the
	// override and a commit from before that checkpoint.
	withCheckpointedOverride := func(t *testing.T, proj *fixture.Project, owner *harness.Principal) (secretmanager.Secret, commit) {
		t.Helper()
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared-value")
		secretmanager.CreateSecret(t, proj, "dev", "APP_TOKEN", "v0")
		before := headCommit(t, proj, "dev", "/")
		override := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", personalValue, secretmanager.As(owner), secretmanager.WithPersonal())
		for i := range checkpointWindow {
			secretmanager.UpdateSecret(t, proj, "dev", "APP_TOKEN", fmt.Sprintf("v%d", i+1))
		}
		return override, before
	}

	t.Run("should leave another user's override out of a viewer's compare after a checkpoint", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		override, before := withCheckpointedOverride(t, proj, owner)

		// Action
		res, err := viewer.API.CompareFolderCommitWithResponse(t.Context(), before.ID, &api.CompareFolderCommitParams{
			ProjectId: proj.ID, FolderId: folderID(t, proj, "dev", "/"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "APP_TOKEN")
		require.NotContains(t, string(res.Body), personalValue)
		require.NotContains(t, string(res.Body), override.ID)
	})

	t.Run("should keep another user's override when a member rolls back past a checkpoint", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		_, before := withCheckpointedOverride(t, proj, owner)

		// Action
		res, err := rollback(t, member, proj, "dev", folderID(t, proj, "dev", "/"), before.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "v0", secretmanager.GetSecret(t, proj, "dev", "APP_TOKEN").Value)
		require.Equal(t, personalValue, secretmanager.GetSecret(t, proj, "dev", "DB_PASS", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
	})

	t.Run("should leave another user's override out of commit changes when a secret it references is renamed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_HOST", "db.internal")
		secretmanager.CreateSecret(t, proj, "dev", "CONN", "shared-${DB_HOST}")
		override := secretmanager.CreateSecret(t, proj, "dev", "CONN", personalValue+"-${DB_HOST}", secretmanager.As(owner), secretmanager.WithPersonal())
		renamed, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "DB_HOST", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), NewSecretName: new("DATABASE_HOST"),
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, renamed.StatusCode(), renamed.Body)

		// Action
		bodies := ""
		for _, c := range commitsAt(t, viewer, proj, "dev", "/") {
			res, err := viewer.API.GetFolderCommitChangesWithResponse(t.Context(), c.ID, &api.GetFolderCommitChangesParams{ProjectId: proj.ID})
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			bodies += string(res.Body)
		}

		// Assert
		require.Contains(t, bodies, "shared-${DATABASE_HOST}")
		require.NotContains(t, bodies, personalValue)
		require.NotContains(t, bodies, override.ID)
		require.Equal(t, personalValue+"-db.internal", secretmanager.GetSecret(t, proj, "dev", "CONN", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
	})
}
