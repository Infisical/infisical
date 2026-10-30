package imports_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretImport_Permission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// member can manage imports anywhere but read secrets only in envs.
	member := func(t *testing.T, proj *fixture.Project, envs ...string) *harness.Principal {
		t.Helper()
		proj.NewRole(t, "importer",
			fixture.Permission{Subject: "secret-imports", Action: []string{"read", "create", "edit", "delete"}},
			fixture.Permission{
				Subject:    "secrets",
				Action:     []string{"read"},
				Conditions: map[string]any{"environment": map[string]any{"$in": envs}},
			})
		return proj.NewMachineIdentity(t, fixture.WithRoles("importer"))
	}

	t.Run("should refuse creating an import when the actor cannot describe secrets at the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		importer := member(t, proj, "dev")

		// Action
		res := importInto(t, importer, proj, "dev", "/", secretmanager.Location{Env: "prod", Path: "/"})

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to describeSecret on secrets", res.JSON403.Message)
		require.Empty(t, listImports(t, proj, "dev", "/"))
	})

	t.Run("should check describe again at the new source when an import is repointed", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		importer := member(t, proj, "dev", "staging")
		importID := secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"},
			secretmanager.ImportAs(secretmanager.As(importer)))

		// Action
		res := repoint(t, importer, proj, "dev", importID, secretmanager.Location{Env: "prod", Path: "/"})

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to describeSecret on secrets", res.JSON403.Message)
		rows := listImports(t, proj, "dev", "/")
		require.Len(t, rows, 1)
		require.Equal(t, "staging", rows[0].Env)
	})

	t.Run("should return the import with no secrets, and no error, when the reader cannot read the source", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		reader := member(t, proj, "dev")
		secretmanager.CreateSecret(t, proj, "prod", "PROD_ONLY", "hidden")
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"})

		// Action
		groups := importedSecrets(t, reader, proj, "dev", "/")

		// Assert
		require.Equal(t, []importedGroup{{Env: "prod", Path: "/", Secrets: map[string]string{}}}, groups)
	})
}
