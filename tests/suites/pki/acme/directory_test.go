package acme_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAcmeDirectory_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the profile's ACME endpoints and require external account binding", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		c := p.client(t)

		// Action
		res, err := c.api.GetAcmeApplicationDirectoryWithResponse(t.Context(), p.app.ID, p.profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		var dir map[string]any
		require.NoError(t, json.Unmarshal(res.Body, &dir))
		require.Equal(t, map[string]any{
			"newNonce":   c.URL(c.profilePath() + "/new-nonce"),
			"newAccount": c.NewAccountURL(),
			"newOrder":   c.NewOrderURL(),
			"meta":       map[string]any{"externalAccountRequired": true},
		}, dir)
	})
}
