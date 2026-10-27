package sharing_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCrossProjectImport(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read another project's granted folder through an import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.GrantFolder(t, source, target, sourceRoot)

		// Action
		res := crossImport(t, target, source, sourceRoot, false)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "importing returned %s", apierr.Body(res.Body))
		require.Equal(t, []map[string]string{{"SHARED": "from-source"}}, importedSecrets(t, tn.Admin, target))
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "SHARED").Value)
	})

	t.Run("should refuse a cross-project import without a grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)

		// Action
		res := crossImport(t, target, source, sourceRoot, false)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "No project grant found allowing this cross-project import", res.JSON403.Message)
		require.NotContains(t, string(res.Body), "from-source")
		require.Zero(t, importCount(t, target))
	})

	t.Run("should refuse replication for a cross-project import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.GrantFolder(t, source, target, sourceRoot)

		// Action
		res := crossImport(t, target, source, sourceRoot, true)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Replication is not supported for cross-project imports", res.JSON400.Message)
		require.Zero(t, importCount(t, target))
	})

	t.Run("should mark a cross-project import as revoked and stop serving it once its grant is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		grantID := secretmanager.GrantFolder(t, source, target, sourceRoot)
		importID := secretmanager.CreateImport(t, target, "dev", sourceRoot, secretmanager.FromProject(source))
		require.Equal(t, map[string]bool{importID: false}, dashboardImports(t, target))

		// Action
		res := revokeGrant(t, tn.Admin, source, grantID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking returned %s", apierr.Body(res.Body))
		require.Equal(t, map[string]bool{importID: true}, dashboardImports(t, target))
		require.Empty(t, importedSecrets(t, tn.Admin, target))
	})

	t.Run("should check the importing folder's conditions, not the source path, for each source secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		shared := secretmanager.Location{Env: "prod", Path: "/shared"}
		secretmanager.CreateFolder(t, source, "prod", "/shared")
		secretmanager.CreateSecret(t, source, "prod", "ALLOWED", "yes", secretmanager.WithPath("/shared"))
		secretmanager.CreateSecret(t, source, "prod", "DENIED", "no", secretmanager.WithPath("/shared"))
		secretmanager.GrantFolder(t, source, target, shared)
		secretmanager.CreateImport(t, target, "dev", shared, secretmanager.FromProject(source))
		target.NewRole(t, "dev-root-allowed",
			fixture.Permission{Subject: "secret-imports", Action: []string{"read"}},
			fixture.Permission{
				Subject: "secrets",
				Action:  []string{"read"},
				Conditions: map[string]any{
					"environment": map[string]any{"$eq": "dev"},
					"secretPath":  map[string]any{"$eq": "/"},
					"secretName":  map[string]any{"$eq": "ALLOWED"},
				},
			})
		reader := target.NewMachineIdentity(t, fixture.WithRoles("dev-root-allowed"))

		// Action
		got := importedSecrets(t, reader, target)

		// Assert
		require.Equal(t, []map[string]string{{"ALLOWED": "yes"}}, got)
	})

	t.Run("should serve only the first of a local and a cross-project import that share an environment slug and path", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "[BUG?] imports are de-duplicated by environment slug and path without the project; a fix that serves both updates this claim")

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.CreateSecret(t, source, "prod", "SOURCE_KEY", "from-source")
		secretmanager.CreateSecret(t, target, "prod", "LOCAL_KEY", "from-target")
		prodRoot := secretmanager.Location{Env: "prod", Path: "/"}
		secretmanager.GrantFolder(t, source, target, prodRoot)
		secretmanager.CreateImport(t, target, "dev", prodRoot)

		// Action
		secretmanager.CreateImport(t, target, "dev", prodRoot, secretmanager.FromProject(source))

		// Assert
		require.Equal(t, 2, importCount(t, target))
		require.Equal(t, []map[string]string{{"LOCAL_KEY": "from-target"}}, importedSecrets(t, tn.Admin, target))
	})
}
