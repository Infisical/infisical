package infisical_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestBootstrap(t *testing.T) {
	requireDocker(t)
	spec.Why(t, `Bootstrap is the root of every principal. If it is wrong, the failure is
		an unexplained 401 in whichever test runs first.`)

	app := bootStack(t)
	root, err := infisical.Bootstrap(t.Context(), app.BaseURL(infra.External))
	require.NoError(t, err)

	t.Run("should yield an instance admin identity token", func(t *testing.T) {
		require.NotEmpty(t, root.MachineIdentityToken, "instance-level suites have no principal")
		require.NotEqual(t, uuid.Nil, root.MachineIdentityID)
	})

	t.Run("should keep the root user credentials", func(t *testing.T) {
		spec.Why(t, `Creating an organization refuses any actor that is not a user, so the
			password is the only thing that can mint tenants.`)

		require.NotEmpty(t, root.Email)
		require.NotEmpty(t, root.Password)
	})

	t.Run("should re-enable signup", func(t *testing.T) {
		spec.Why(t, `Bootstrap disables signup on non-cloud instances, which would leave no
			path to a non-administrator user.`)

		// Action
		st, err := app.Status(t.Context())

		// Assert
		require.NoError(t, err)
		require.True(t, st.SignupAllowed)
	})

	t.Run("should log in instead of failing when the instance is already bootstrapped", func(t *testing.T) {
		spec.Why(t, `Bootstrap is one shot per database, but containers are adopted, so the
			second binary in a run finds an instance already bootstrapped.`)

		// Action
		again, err := infisical.Bootstrap(t.Context(), app.BaseURL(infra.External))

		// Assert
		require.NoError(t, err)
		require.Equal(t, root.Email, again.Email)
	})
}
