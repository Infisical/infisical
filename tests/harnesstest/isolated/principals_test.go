package harnesstest_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestAdminPrincipals_AreSeparate(t *testing.T) {
	spec.Why(t, `If a tenant administrator could write instance configuration, one test
		could disable signup under every other package. This was wrong once, when the
		tenant admin was the bootstrap root. Isolated because the first case writes
		instance configuration.`)

	h := harness.From(t)

	t.Run("should let the instance admin write instance configuration", func(t *testing.T) {
		// Setup
		admin := h.InstanceAdmin(t)

		// Action
		res, err := admin.API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "refused: %s", res.Body)
	})

	t.Run("should refuse instance configuration when the caller is a tenant admin", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(true)})

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode(), "a tenant administrator wrote instance configuration")
	})
}
