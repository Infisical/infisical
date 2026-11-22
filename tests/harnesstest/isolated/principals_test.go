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

		before := allowSignUp(t, h.InstanceAdmin(t).API)

		// Action
		res, err := tn.Admin.API.UpdateAdminConfigWithResponse(t.Context(),
			api.UpdateAdminConfigJSONRequestBody{AllowSignUp: new(!before)})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "a tenant administrator got %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, before, allowSignUp(t, h.InstanceAdmin(t).API))
	})
}

func allowSignUp(t *testing.T, c *api.ClientWithResponses) bool {
	t.Helper()
	res, err := c.GetAdminConfigWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading admin config returned %d: %s", res.StatusCode(), res.Body)
	require.NotNil(t, res.JSON200.Config.AllowSignUp)
	return *res.JSON200.Config.AllowSignUp
}
