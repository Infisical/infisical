package validation_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretValidationRule_ReuseWithinScope(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	uniqueInProdRoot := func(t *testing.T, proj *fixture.Project) {
		t.Helper()
		newRule(t, proj, "no-duplicate-values-in-prod", inEnv("prod"),
			onValues(valueConstraints{UniqueWithinScope: new(true)}))
	}

	t.Run("should accept distinct values in the rule's environment and a repeated value outside it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		uniqueInProdRoot(t, proj)
		secretmanager.CreateSecret(t, proj, "prod", "UNIQUE_A", "unique-value-a")
		secretmanager.CreateSecret(t, proj, "prod", "UNIQUE_B", "unique-value-b")
		secretmanager.CreateSecret(t, proj, "prod", "SHARED_ACROSS_ENVS", "shared-across-envs")

		// Action
		res := createSecret(t, tn.Admin, proj, "staging", "/", "SHARED_ACROSS_ENVS_COPY", "shared-across-envs")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)
		require.Equal(t, "shared-across-envs", secretmanager.GetSecret(t, proj, "staging", "SHARED_ACROSS_ENVS_COPY").Value)
	})

	t.Run("should accept a repeated value at a path the rule does not reach", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		uniqueInProdRoot(t, proj)
		secretmanager.CreateFolder(t, proj, "prod", "/folder")
		secretmanager.CreateSecret(t, proj, "prod", "SHARED_ACROSS_PATHS", "shared-across-paths")

		// Action
		res := createSecret(t, tn.Admin, proj, "prod", "/folder", "SHARED_ACROSS_PATHS_COPY", "shared-across-paths")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)
		require.Equal(t, "shared-across-paths",
			secretmanager.GetSecret(t, proj, "prod", "SHARED_ACROSS_PATHS_COPY", secretmanager.WithPath("/folder")).Value)
	})

	t.Run("should refuse a second secret holding a value the scope already holds and name where to an admin", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		uniqueInProdRoot(t, proj)
		secretmanager.CreateSecret(t, proj, "prod", "ORIGINAL", "duplicated-value")

		// Action
		res := createSecret(t, tn.Admin, proj, "prod", "/", "DUPLICATE", "duplicated-value")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message,
			`Secret "DUPLICATE": value is already used by secret "ORIGINAL" in environment "prod" at path "/"`)
		require.Len(t, secretmanager.ListSecrets(t, proj, "prod"), 1)
	})

	t.Run("should refuse updating a secret to a value another secret in scope holds and keep the old value", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		uniqueInProdRoot(t, proj)
		secretmanager.CreateSecret(t, proj, "prod", "UPDATE_TARGET", "value-before-update")
		secretmanager.CreateSecret(t, proj, "prod", "UPDATE_HOLDER", "value-held-by-another-secret")

		// Action
		res := updateSecret(t, tn.Admin, proj, "prod", "UPDATE_TARGET", "value-held-by-another-secret")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, res.JSON400.Message,
			`Secret "UPDATE_TARGET": value is already used by secret "UPDATE_HOLDER" in environment "prod"`)
		require.Equal(t, "value-before-update", secretmanager.GetSecret(t, proj, "prod", "UPDATE_TARGET").Value)
	})

	t.Run("should accept re-saving a secret with the value it already holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		uniqueInProdRoot(t, proj)
		secretmanager.CreateSecret(t, proj, "prod", "SELF_UPDATE", "self-update-value")

		// Action
		res := updateSecret(t, tn.Admin, proj, "prod", "SELF_UPDATE", "self-update-value")

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating returned %s", res.Body)
		require.Equal(t, "self-update-value", secretmanager.GetSecret(t, proj, "prod", "SELF_UPDATE").Value)
	})
}
