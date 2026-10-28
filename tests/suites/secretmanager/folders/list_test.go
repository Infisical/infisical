package folders_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestFolder_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the folders directly under the path in that environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api")
		secretmanager.CreateFolder(t, proj, "dev", "/web")
		secretmanager.CreateFolder(t, proj, "prod", "/billing")

		// Action
		names := folderNames(t, proj, "dev", "/")

		// Assert
		require.ElementsMatch(t, []string{"app", "web"}, names)
	})

	t.Run("should list nothing for a path that does not exist, while a secret list answers not found", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Pins today's asymmetry: the folder list answers 200 for a missing path and the secret list 404.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		folders, err := tn.Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
			ProjectId: proj.ID, Environment: "dev", Path: "/nope",
		})
		require.NoError(t, err)
		secrets, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"), SecretPath: new("/nope"),
		})
		require.NoError(t, err)

		// Assert
		require.NotNilf(t, folders.JSON200, "listing folders returned %d: %s", folders.StatusCode(), folders.Body)
		require.Empty(t, folders.JSON200.Folders)
		require.Equal(t, http.StatusNotFound, secrets.StatusCode())
	})

	t.Run("should never list the reserved folder a replicated import creates", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "prod", "SHARED_KEY", "from-prod")
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"}, secretmanager.Replicated())
		// One worker serves every tenant's replication jobs, so a run can queue behind others.
		wait.Until(t, "the replicated import to carry the source secret", func() bool {
			res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
				ProjectId: &proj.ID, Environment: new("dev"),
			})
			return err == nil && res.JSON200 != nil && res.JSON200.Imports != nil &&
				len(*res.JSON200.Imports) == 1 && len((*res.JSON200.Imports)[0].Secrets) == 1
		}, wait.Timeout(60*time.Second))

		// Action
		flat := folderNames(t, proj, "dev", "/")
		deep, err := tn.Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
			ProjectId: proj.ID, Environment: "dev", Path: "/",
		}, recursive)
		require.NoError(t, err)

		// Assert
		require.Equal(t, []string{"app"}, flat)
		require.NotNilf(t, deep.JSON200, "listing recursively returned %d: %s", deep.StatusCode(), deep.Body)
		require.Len(t, deep.JSON200.Folders, 1)
		require.Equal(t, "app", deep.JSON200.Folders[0].Name)
	})

	t.Run("should list every folder below the path, with its path relative to it, when listing recursively", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app/api/v1")
		secretmanager.CreateFolder(t, proj, "dev", "/app/web")
		secretmanager.CreateFolder(t, proj, "dev", "/other")

		// Action
		res, err := tn.Admin.API.ListSecretFoldersWithResponse(t.Context(), &api.ListSecretFoldersParams{
			ProjectId: proj.ID, Environment: "dev", Path: "/app",
		}, recursive)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), res.Body)
		paths := []string{}
		for _, f := range res.JSON200.Folders {
			require.NotNil(t, f.RelativePath)
			paths = append(paths, *f.RelativePath)
		}
		require.ElementsMatch(t, []string{"/api", "/api/v1", "/web"}, paths)
	})
}
