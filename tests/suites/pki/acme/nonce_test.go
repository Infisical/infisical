package acme_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// accountEndpointNames name the URLs a registered account signs requests to.
var accountEndpointNames = []string{"orders", "new-order", "order", "finalize", "certificate", "authorization", "challenge"}

// accountEndpoints are those URLs for one account and one of its orders.
func accountEndpoints(t *testing.T, c *acmeClient, o Order) map[string]string {
	t.Helper()
	authz := c.Authorization(t, o.Authorizations[0])
	return map[string]string{
		"orders":        c.OrdersURL(),
		"new-order":     c.NewOrderURL(),
		"order":         o.URL,
		"finalize":      o.URL + "/finalize",
		"certificate":   o.URL + "/certificate",
		"authorization": o.Authorizations[0],
		"challenge":     authz.Challenges[0].URL,
	}
}

func requireProblem(t *testing.T, res acmeResponse, status int, kind, detail string) {
	t.Helper()
	require.Equalf(t, status, res.Status, "ACME answered %d: %s", res.Status, res.Body)
	p := res.Problem(t)
	require.Equal(t, status, p.Status)
	require.Equal(t, "urn:ietf:params:acme:error:"+kind, p.Type)
	require.Equal(t, detail, p.Detail)
}

func TestAcmeNonce_New(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hand out a nonce in Replay-Nonce without authentication", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		c := p.client(t)

		// Action
		res, err := c.api.GetAcmeNewNonceWithResponse(t.Context(), p.profile.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusNoContent, res.StatusCode())
		require.NotEmpty(t, res.HTTPResponse.Header.Get("Replay-Nonce"))
	})
}

func TestAcmeNonce_Replay(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a nonce it never issued on every account endpoint", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, name := range accountEndpointNames {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)
				url := accountEndpoints(t, c, c.NewOrder(t, domain("www")))[name]

				// Action
				res := c.PostRaw(t, url, map[string]any{"alg": "RS256", "nonce": "oFvnlFP1wIhRlYS2jTaXbA", "url": url, "kid": c.AccountURL}, []byte("{}"))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "badNonce", "Invalid nonce")
			})
		}
	})

	t.Run("should refuse a nonce the second time it is used on every account endpoint", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, name := range accountEndpointNames {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)
				url := accountEndpoints(t, c, c.NewOrder(t, domain("www")))[name]
				nonce := c.Nonce(t)
				first := c.PostRaw(t, c.OrdersURL(), map[string]any{"alg": "RS256", "nonce": nonce, "url": c.OrdersURL(), "kid": c.AccountURL}, []byte("{}"))
				require.Equal(t, http.StatusOK, first.Status, "the nonce was refused the first time")

				// Action
				res := c.PostRaw(t, url, map[string]any{"alg": "RS256", "nonce": nonce, "url": url, "kid": c.AccountURL}, []byte("{}"))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "badNonce", "Invalid nonce")
			})
		}
	})
}
