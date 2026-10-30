package sharing_test

import (
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestCrossProjectReference(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should expand a reference into another project's granted folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		secretmanager.GrantFolder(t, source, target, sourceRoot)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.SHARED}", source.Slug))

		// Assert
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should expand a reference into a nested folder that is granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, source, "dev", "/app/api")
		secretmanager.CreateSecret(t, source, "dev", "API_KEY", "nested-value", secretmanager.WithPath("/app/api"))
		secretmanager.GrantFolder(t, source, target, secretmanager.Location{Env: "dev", Path: "/app/api"})

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.app.api.API_KEY}", source.Slug))

		// Assert
		require.Equal(t, "nested-value", secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep the reference literal when the folder is not granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		ref := fmt.Sprintf("${@%s.dev.SHARED}", source.Slug)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep a reference into a subfolder of a granted folder literal", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		secretmanager.CreateFolder(t, source, "dev", "/app/api")
		secretmanager.CreateSecret(t, source, "dev", "API_KEY", "nested-value", secretmanager.WithPath("/app/api"))
		secretmanager.GrantFolder(t, source, target, secretmanager.Location{Env: "dev", Path: "/app"})
		ref := fmt.Sprintf("${@%s.dev.app.api.API_KEY}", source.Slug)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep a reference into an environment the grant does not cover literal", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, source, "staging", "SHARED", "from-staging")
		secretmanager.GrantFolder(t, source, target, sourceRoot)
		ref := fmt.Sprintf("${@%s.staging.SHARED}", source.Slug)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep a reference into another organization's project literal", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		_, target := sharingProjects(t, tn)
		other := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, other, "dev", "FOREIGN", "foreign-value")
		ref := fmt.Sprintf("${@%s.dev.FOREIGN}", other.Slug)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Assert
		got := secretmanager.GetSecret(t, target, "dev", "REF").Value
		require.Equal(t, ref, got)
		require.NotContains(t, got, "foreign-value")
	})

	t.Run("should keep the reference literal once the organization turns sharing off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.GrantFolder(t, source, target, sourceRoot)
		ref := fmt.Sprintf("${@%s.dev.SHARED}", source.Slug)
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Action
		secretmanager.AllowCrossProjectSharing(t, tn, false)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should not expand references inside the other project's value", func(t *testing.T) {
		t.Parallel()

		// Setup
		source, target := sharingProjects(t, h.NewTenant(t))
		secretmanager.CreateSecret(t, source, "dev", "INNER", "inner")
		secretmanager.CreateSecret(t, source, "dev", "OUTER", "${INNER}")
		secretmanager.GrantFolder(t, source, target, sourceRoot)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.OUTER}", source.Slug))

		// Assert
		require.Equal(t, "${INNER}", secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep resolving after the plan loses cross-project sharing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.GrantFolder(t, source, target, sourceRoot)
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.SHARED}", source.Slug))

		// Action
		tn.SetPlan(t, license.Enterprise().Without(license.CrossProjectSecretSharing))

		// Assert
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "REF").Value,
			"a license check must never change what an existing reference reads")
	})
}
