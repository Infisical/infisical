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
	t.Run("should repair another user's override references when a rollback undoes a rename", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		member := proj.NewUser(t, fixture.WithPrincipalName("member"))
		viewer := proj.NewUser(t, fixture.WithPrincipalName("viewer"), fixture.WithRoles("viewer"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_HOST", "db.internal")
		secretmanager.CreateSecret(t, proj, "dev", "CONN", "shared-${DB_HOST}")
		secretmanager.CreateSecret(t, proj, "dev", "CONN", personalValue+"-${DB_HOST}", secretmanager.As(owner), secretmanager.WithPersonal())
		target := headCommit(t, proj, "dev", "/")
		renamed, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "DB_HOST", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), NewSecretName: new("DATABASE_HOST"),
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, renamed.StatusCode(), renamed.Body)

		// Action
		res, err := rollback(t, member, proj, "dev", folderID(t, proj, "dev", "/"), target.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "shared-db.internal", secretmanager.GetSecret(t, proj, "dev", "CONN").Value)
		require.Equal(t, personalValue+"-db.internal", secretmanager.GetSecret(t, proj, "dev", "CONN", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
		for _, c := range commitsAt(t, viewer, proj, "dev", "/") {
			changes, err := viewer.API.GetFolderCommitChangesWithResponse(t.Context(), c.ID, &api.GetFolderCommitChangesParams{ProjectId: proj.ID})
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, changes.StatusCode(), changes.Body)
			require.NotContains(t, string(changes.Body), personalValue)
		}
	})
	t.Run("should restore every reference when a rollback undoes chained renames", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "one")
		secretmanager.CreateSecret(t, proj, "dev", "B", "two")
		secretmanager.CreateSecret(t, proj, "dev", "FROM_A", "${A}")
		secretmanager.CreateSecret(t, proj, "dev", "FROM_B", "${B}")
		secretmanager.CreateSecret(t, proj, "dev", "FROM_A", "owner-${A}", secretmanager.As(owner), secretmanager.WithPersonal())
		secretmanager.CreateSecret(t, proj, "dev", "FROM_B", "owner-${B}", secretmanager.As(owner), secretmanager.WithPersonal())
		target := headCommit(t, proj, "dev", "/")
		for _, rename := range [][2]string{{"B", "C"}, {"A", "B"}} {
			res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), rename[0], api.UpdateSecretV4JSONRequestBody{
				ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), NewSecretName: new(rename[1]),
			})
			require.NoError(t, err)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}

		// Action
		res, err := rollback(t, tn.Admin, proj, "dev", folderID(t, proj, "dev", "/"), target.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "one", secretmanager.GetSecret(t, proj, "dev", "FROM_A").Value)
		require.Equal(t, "two", secretmanager.GetSecret(t, proj, "dev", "FROM_B").Value)
		require.Equal(t, "owner-one", secretmanager.GetSecret(t, proj, "dev", "FROM_A", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
		require.Equal(t, "owner-two", secretmanager.GetSecret(t, proj, "dev", "FROM_B", secretmanager.As(owner), secretmanager.WithPersonal()).Value)
	})
	t.Run("should repair references in other folders when a rollback undoes a rename", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "DB_HOST", "db.internal")
		secretmanager.CreateSecret(t, proj, "dev", "LOCAL", "${DB_HOST}")
		target := headCommit(t, proj, "dev", "/")
		secretmanager.CreateSecret(t, proj, "dev", "CONN", "${dev.DB_HOST}", secretmanager.WithPath("/app"))
		renamed, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "DB_HOST", api.UpdateSecretV4JSONRequestBody{
			ProjectId: proj.ID, Environment: "dev", SecretPath: new("/"), NewSecretName: new("DATABASE_HOST"),
		})
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, renamed.StatusCode(), renamed.Body)

		// Action
		res, err := rollback(t, tn.Admin, proj, "dev", folderID(t, proj, "dev", "/"), target.ID, false)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "db.internal", secretmanager.GetSecret(t, proj, "dev", "CONN", secretmanager.WithPath("/app")).Value)
		require.Equal(t, "db.internal", secretmanager.GetSecret(t, proj, "dev", "DB_HOST").Value)
		local, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "LOCAL", &api.GetSecretByNameV4Params{
			ProjectId: proj.ID, Environment: new("dev"), SecretPath: new("/"),
			ExpandSecretReferences: new(api.GetSecretByNameV4ParamsExpandSecretReferencesFalse),
		})
		require.NoError(t, err)
		require.NotNilf(t, local.JSON200, "reading LOCAL returned %d: %s", local.StatusCode(), local.Body)
		require.Equal(t, "${DB_HOST}", local.JSON200.Secret.SecretValue)
		require.Equal(t, "db.internal", secretmanager.GetSecret(t, proj, "dev", "LOCAL").Value)
		head := headCommit(t, proj, "dev", "/")
		require.Equal(t, "Rollback to previous commit", head.Message, "the repair must not rewrite the secrets the rollback restored")
	})
}
