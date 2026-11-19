package imports_test

import (
	"fmt"
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

func TestSecretImport_Resolve(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// inEveryEnv creates folderPath in dev, staging and prod, so a path below the root
	// can be imported between them.
	inEveryEnv := func(t *testing.T, proj *fixture.Project, folderPath string) {
		t.Helper()
		if folderPath == "/" {
			return
		}
		for _, env := range []string{"dev", "staging", "prod"} {
			secretmanager.CreateFolder(t, proj, env, folderPath)
		}
	}

	for _, folderPath := range []string{"/", "/deep"} {
		t.Run(fmt.Sprintf("should resolve secrets two imports deep when dev imports staging and staging imports prod at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: folderPath}, secretmanager.IntoPath(folderPath))
			secretmanager.CreateImport(t, proj, "staging", secretmanager.Location{Env: "prod", Path: folderPath}, secretmanager.IntoPath(folderPath))

			// Action
			secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "stage-value", secretmanager.WithPath(folderPath))
			secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod-value", secretmanager.WithPath(folderPath))

			// Assert
			require.Equal(t, "stage-value", secretmanager.GetSecret(t, proj, "dev", "STAGING_KEY", secretmanager.WithPath(folderPath)).Value)
			require.Equal(t, "prod-value", secretmanager.GetSecret(t, proj, "dev", "PROD_KEY", secretmanager.WithPath(folderPath)).Value)
			groups := importedSecrets(t, tn.Admin, proj, "dev", folderPath)
			require.Len(t, groups, 1, "the prod secrets arrive through the staging import, not as an import of their own")
			require.Equal(t, map[string]string{"STAGING_KEY": "stage-value", "PROD_KEY": "prod-value"}, groups[0].Secrets)
		})

		t.Run(fmt.Sprintf("should resolve secrets from every source when one folder imports two at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "stage-value", secretmanager.WithPath(folderPath))
			secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod-value", secretmanager.WithPath(folderPath))

			// Action
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: folderPath}, secretmanager.IntoPath(folderPath))
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: folderPath}, secretmanager.IntoPath(folderPath))

			// Assert
			require.Equal(t, "stage-value", secretmanager.GetSecret(t, proj, "dev", "STAGING_KEY", secretmanager.WithPath(folderPath)).Value)
			require.Equal(t, "prod-value", secretmanager.GetSecret(t, proj, "dev", "PROD_KEY", secretmanager.WithPath(folderPath)).Value)
			groups := importedSecrets(t, tn.Admin, proj, "dev", folderPath)
			require.Len(t, groups, 2)
			require.Equal(t, importedGroup{Env: "staging", Path: folderPath, Secrets: map[string]string{"STAGING_KEY": "stage-value"}}, groups[0])
			require.Equal(t, importedGroup{Env: "prod", Path: folderPath, Secrets: map[string]string{"PROD_KEY": "prod-value"}}, groups[1])
		})

		t.Run(fmt.Sprintf("should resolve one source in every folder that imports it at %s", folderPath), func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			inEveryEnv(t, proj, folderPath)
			secretmanager.CreateSecret(t, proj, "dev", "SHARED_KEY", "shared-value", secretmanager.WithPath(folderPath))

			// Action
			secretmanager.CreateImport(t, proj, "staging", secretmanager.Location{Env: "dev", Path: folderPath}, secretmanager.IntoPath(folderPath))
			secretmanager.CreateImport(t, proj, "prod", secretmanager.Location{Env: "dev", Path: folderPath}, secretmanager.IntoPath(folderPath))

			// Assert
			require.Equal(t, "shared-value", secretmanager.GetSecret(t, proj, "staging", "SHARED_KEY", secretmanager.WithPath(folderPath)).Value)
			require.Equal(t, "shared-value", secretmanager.GetSecret(t, proj, "prod", "SHARED_KEY", secretmanager.WithPath(folderPath)).Value)
		})
	}

	t.Run("should pick up a secret created at the source after the import was made", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"})
		require.Equal(t, map[string]string{}, importedSecrets(t, tn.Admin, proj, "dev", "/")[0].Secrets)

		// Action
		secretmanager.CreateSecret(t, proj, "prod", "LATE", "arrived")

		// Assert
		require.Equal(t, map[string]string{"LATE": "arrived"}, importedSecrets(t, tn.Admin, proj, "dev", "/")[0].Secrets)
		require.Equal(t, "arrived", secretmanager.GetSecret(t, proj, "dev", "LATE").Value)
	})
}

func TestSecretImport_Precedence(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should prefer a local secret over an imported one with the same name", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "prod", "KEY", "imported")
		secretmanager.CreateSecret(t, proj, "dev", "KEY", "local")

		// Action
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"})

		// Assert
		require.Equal(t, "local", secretmanager.GetSecret(t, proj, "dev", "KEY").Value)
		require.Equal(t, "local", secretmanager.ListSecrets(t, proj, "dev")[0].Value)
		require.Equal(t, map[string]string{"KEY": "imported"}, importedSecrets(t, tn.Admin, proj, "dev", "/")[0].Secrets,
			"a list returns the imported value beside the local one; the caller applies the precedence")
	})

	t.Run("should resolve a name in two imports to the later import on get, while list returns both in import order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "KEY", "from-staging")
		secretmanager.CreateSecret(t, proj, "prod", "KEY", "from-prod")

		// Action
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"})
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "prod", Path: "/"})

		// Assert
		require.Equal(t, "from-prod", secretmanager.GetSecret(t, proj, "dev", "KEY").Value)
		require.Equal(t, map[string][]string{"KEY": {"from-staging", "from-prod"}},
			importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/")))
	})
}

func TestSecretImport_Cycles(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse importing a folder into itself", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res := importInto(t, tn.Admin, proj, "dev", "/", secretmanager.Location{Env: "dev", Path: "/"})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cyclic import not allowed", res.JSON400.Message)
		require.Empty(t, listImports(t, proj, "dev", "/"))
	})

	t.Run("should refuse an import that closes a two-way cycle", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"})

		// Action
		res := importInto(t, tn.Admin, proj, "staging", "/", secretmanager.Location{Env: "dev", Path: "/"})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cyclic import not allowed", res.JSON400.Message)
		require.Empty(t, listImports(t, proj, "staging", "/"))
	})

	t.Run("should accept a three-way cycle and answer reads without looping", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "s")
		secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "p")
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "staging", Path: "/"})
		secretmanager.CreateImport(t, proj, "staging", secretmanager.Location{Env: "prod", Path: "/"})

		// Action
		res := importInto(t, tn.Admin, proj, "prod", "/", secretmanager.Location{Env: "dev", Path: "/"})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "closing the cycle returned %s", apierr.Body(res.Body))
		require.Equal(t, "p", secretmanager.GetSecret(t, proj, "dev", "PROD_KEY").Value)
		values := importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/"))
		require.Equal(t, []string{"s"}, values["STAGING_KEY"])
		require.Equal(t, []string{"p"}, values["PROD_KEY"])
	})

	t.Run("should drop secrets three imports deep, well before the depth limit of 10", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "[BUG?] fnSecretsV2FromImports appends a third level to a copy the reply no longer holds; a fix that honours the depth limit updates this claim")

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		const links = 3
		for i := 1; i <= links; i++ {
			folder := fmt.Sprintf("/f%d", i)
			secretmanager.CreateFolder(t, proj, "dev", folder)
			secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("K%d", i), "v", secretmanager.WithPath(folder))
		}
		for i := 1; i < links; i++ {
			secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: fmt.Sprintf("/f%d", i+1)},
				secretmanager.IntoPath(fmt.Sprintf("/f%d", i)))
		}

		// Action
		secretmanager.CreateImport(t, proj, "dev", secretmanager.Location{Env: "dev", Path: "/f1"})

		// Assert
		values := importedValues(importedSecrets(t, tn.Admin, proj, "dev", "/"))
		require.Contains(t, values, "K1")
		require.Contains(t, values, "K2")
		require.NotContains(t, values, "K3")
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "K3",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev")})
		require.NoError(t, err)
		require.Equal(t, http.StatusNotFound, res.StatusCode())
	})
}
