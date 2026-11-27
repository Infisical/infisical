package responseheaders_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestResponseHeaders_BrowserPolicy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a browser load and frame nothing when it opens an API response", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetInstanceStatusWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		require.Equal(t, "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
			res.HTTPResponse.Header.Get("Content-Security-Policy"))
	})

	t.Run("should turn off camera, microphone and geolocation when a browser opens an API response", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetInstanceStatusWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		policy := res.HTTPResponse.Header.Get("Permissions-Policy")
		for _, feature := range []string{"camera=()", "microphone=()", "geolocation=()"} {
			require.Contains(t, policy, feature)
		}
	})
}
