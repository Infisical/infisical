package metadata_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSecretMetadata_DashboardSearch(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	// A is env=prod and team=backend, B is env=prod and team=frontend, C is
	// env=staging and team=backend.
	seedPlain := func(t *testing.T, proj *fixture.Project) {
		t.Helper()
		createWithMetadata(t, proj, "SECRET_A", plain("env", "prod"), plain("team", "backend"))
		createWithMetadata(t, proj, "SECRET_B", plain("env", "prod"), plain("team", "frontend"))
		createWithMetadata(t, proj, "SECRET_C", plain("env", "staging"), plain("team", "backend"))
	}

	// D is all encrypted, E mixes a plaintext env with an encrypted team, F is all
	// encrypted with other values.
	seedEncrypted := func(t *testing.T, proj *fixture.Project) {
		t.Helper()
		createWithMetadata(t, proj, "SECRET_D", encrypted("env", "prod"), encrypted("team", "payments"))
		createWithMetadata(t, proj, "SECRET_E", plain("env", "prod"), encrypted("team", "payments"))
		createWithMetadata(t, proj, "SECRET_F", encrypted("env", "staging"), encrypted("team", "billing"))
	}

	t.Run("should return secrets matching any condition, with only the matching pairs, when the operator is or", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedPlain(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "or", [2]string{"env", "prod"}, [2]string{"team", "backend"})

		// Assert
		require.ElementsMatch(t, []string{"SECRET_A", "SECRET_B", "SECRET_C"}, keysOf(matches))
		require.Equal(t, map[string]string{"env": "prod"}, matches["SECRET_B"].Metadata)
	})

	t.Run("should return only secrets matching every condition, with where they live, when the operator is and", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedPlain(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "and", [2]string{"env", "prod"}, [2]string{"team", "backend"})

		// Assert
		require.Equal(t, []string{"SECRET_A"}, keysOf(matches))
		a := matches["SECRET_A"]
		require.Equal(t, map[string]string{"env": "prod", "team": "backend"}, a.Metadata)
		require.Equal(t, "dev", a.Environment)
		require.Equal(t, "/", a.Path)
	})

	t.Run("should return only exact matches for a single condition", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedPlain(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "and", [2]string{"env", "staging"})

		// Assert
		require.Equal(t, []string{"SECRET_C"}, keysOf(matches))
	})

	t.Run("should match encrypted values and return them decrypted when the operator is or", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedEncrypted(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "or", [2]string{"env", "prod"}, [2]string{"team", "payments"})

		// Assert
		require.ElementsMatch(t, []string{"SECRET_D", "SECRET_E"}, keysOf(matches))
		require.Equal(t, "prod", matches["SECRET_D"].Metadata["env"])
	})

	t.Run("should match every condition across plaintext and encrypted values when the operator is and", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedEncrypted(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "and", [2]string{"env", "prod"}, [2]string{"team", "payments"})

		// Assert
		require.ElementsMatch(t, []string{"SECRET_D", "SECRET_E"}, keysOf(matches))
		require.Equal(t, map[string]string{"env": "prod", "team": "payments"}, matches["SECRET_E"].Metadata)
	})

	t.Run("should not match an encrypted value that differs", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		seedEncrypted(t, proj)

		// Action
		matches := searchDashboard(t, tn.Admin, proj, "and", [2]string{"team", "billing"})

		// Assert
		require.Equal(t, []string{"SECRET_F"}, keysOf(matches))
	})
}
