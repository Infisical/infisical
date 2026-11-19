package sharedsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSharedSecret_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse another user deleting a share and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := tn.NewUser(t, harness.WithName("other"))
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "kept", Name: new("kept")})

		// Action
		res, err := other.API.DeleteSharedSecretWithResponse(t.Context(), id)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "User does not have permission to delete shared secret", res.JSON403.Message)
		names, _ := shareNames(t, tn.Admin, nil)
		require.Equal(t, []string{"kept"}, names)
		require.Equal(t, "kept", revealed(t, access(t, tn.Admin.API, id, nil)))
	})

	t.Run("should let a machine identity delete its own share", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t)
		id := share(t, identity.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "gone", Name: new("gone")})

		// Action
		res, err := identity.API.DeleteSharedSecretWithResponse(t.Context(), id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", res.Body)
		_, total := shareNames(t, identity, nil)
		require.Zero(t, total)
		require.Equal(t, http.StatusNotFound, access(t, identity.API, id, nil).StatusCode())
	})
}
