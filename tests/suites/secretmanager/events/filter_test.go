package events_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestProjectEvents_Filter(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stream only the registered event types", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:delete"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DB_URL", "first")
		secretmanager.UpdateSecret(t, proj, "dev", "DB_URL", "second")
		secretmanager.DeleteSecret(t, proj, "dev", "DB_URL")

		// Assert
		require.Equal(t, "secret:delete", s.next(t).Type)
	})

	t.Run("should stream only the registered environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:create").in("dev", "/"))

		// Action
		secretmanager.CreateSecret(t, proj, "staging", "STAGING_KEY", "value")
		secretmanager.CreateSecret(t, proj, "dev", "DEV_KEY", "value")

		// Assert
		require.Equal(t, []secretRef{{"dev", "/", "DEV_KEY"}}, s.next(t).secrets(t))
	})

	t.Run("should stream a subfolder change when the path is /** or unset but not when it is /", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		root := watch(t, proj, on("secret:create").in("dev", "/"))
		recursive := watch(t, proj, on("secret:create").in("dev", "/**"))
		unscoped := watch(t, proj, on("secret:create"))

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "NESTED_KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "dev", "ROOT_KEY", "value")

		// Assert
		require.Equal(t, []secretRef{{"dev", "/", "ROOT_KEY"}}, root.next(t).secrets(t))
		require.Equal(t, []secretRef{{"dev", "/app", "NESTED_KEY"}}, recursive.next(t).secrets(t))
		require.Equal(t, []secretRef{{"dev", "/app", "NESTED_KEY"}}, unscoped.next(t).secrets(t))
	})

	t.Run("should not stream another project's changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		s := watch(t, proj, on("secret:create"))

		// Action
		secretmanager.CreateSecret(t, other, "dev", "OTHER_KEY", "value")
		secretmanager.CreateSecret(t, proj, "dev", "OWN_KEY", "value")

		// Assert
		require.Equal(t, []secretRef{{"dev", "/", "OWN_KEY"}}, s.next(t).secrets(t))
	})
}
