package acme_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// ownedEndpoint is one URL that belongs to an account, and a payload it accepts.
type ownedEndpoint struct {
	name    string
	url     func(c *acmeClient, o Order, challenge string) string
	payload []byte
}

var ownedEndpoints = []ownedEndpoint{
	{"orders", func(c *acmeClient, _ Order, _ string) string { return c.OrdersURL() }, nil},
	{"order", func(_ *acmeClient, o Order, _ string) string { return o.URL }, nil},
	{"finalize", func(_ *acmeClient, o Order, _ string) string { return o.URL + "/finalize" }, []byte(`{"csr": ""}`)},
	{"certificate", func(_ *acmeClient, o Order, _ string) string { return o.URL + "/certificate" }, nil},
	{"authorization", func(_ *acmeClient, o Order, _ string) string { return o.Authorizations[0] }, nil},
	{"challenge", func(_ *acmeClient, _ Order, ch string) string { return ch }, []byte("{}")},
}

// ownerWithOrder is an account with one order, and the URL of its first challenge.
func ownerWithOrder(t *testing.T, p acmeProfile) (*acmeClient, Order, string) {
	t.Helper()
	c := p.registered(t)
	o := c.NewOrder(t, domain("www"))
	return c, o, c.Authorization(t, o.Authorizations[0]).Challenges[0].URL
}

// requireOwnerReaches checks the URL is real by sending the owner's own request there.
func requireOwnerReaches(t *testing.T, owner *acmeClient, url string) {
	t.Helper()
	res := owner.PostRaw(t, url, owner.Header(t, url), []byte(`{"invalid":"payload"}`))
	require.NotEqualf(t, http.StatusNotFound, res.Status, "the owner itself could not reach %s", url)
}

func TestAcmeAccess_CrossAccount(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer 404 when another account of the profile asks for an account's resources", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, e := range ownedEndpoints {
			t.Run(e.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				owner, o, ch := ownerWithOrder(t, p)
				url := e.url(owner, o, ch)
				requireOwnerReaches(t, owner, url)
				other := p.registered(t)

				// Action
				res := other.PostRaw(t, url, other.Header(t, url), e.payload)

				// Assert
				require.Equal(t, http.StatusNotFound, res.Status)
			})
		}
	})

	t.Run("should answer 404 when an account of another profile asks for an account's resources", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		elsewhere := newAcmeProfile(t, tn)

		for _, e := range ownedEndpoints {
			t.Run(e.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				owner, o, ch := ownerWithOrder(t, p)
				url := e.url(owner, o, ch)
				requireOwnerReaches(t, owner, url)
				other := elsewhere.registered(t)

				// Action
				res := other.PostRaw(t, url, other.Header(t, url), []byte("{}"))

				// Assert
				require.Equal(t, http.StatusNotFound, res.Status)
			})
		}
	})

	t.Run("should answer 404 when the same key's account on another profile asks for an account's resources", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		elsewhere := newAcmeProfile(t, tn)

		for _, e := range ownedEndpoints {
			t.Run(e.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				owner, o, ch := ownerWithOrder(t, p)
				url := e.url(owner, o, ch)
				requireOwnerReaches(t, owner, url)
				other := newClientWithKey(t, tn, elsewhere.app, elsewhere.profile, owner.key)
				other.MustRegister(t, elsewhere.eab)

				// Action
				res := other.PostRaw(t, url, other.Header(t, url), e.payload)

				// Assert
				require.Equal(t, http.StatusNotFound, res.Status)
			})
		}
	})
}

func TestAcmeRequest_ProtectedHeader(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a protected header whose url is not the request's", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		elsewhere := map[string]func(c *acmeClient) string{
			"orders":        func(c *acmeClient) string { return "https://evil.com" + c.OrdersURL()[len(c.site):] },
			"order":         func(*acmeClient) string { return "https://example.com/acmes/orders/FOOBAR" },
			"finalize":      func(*acmeClient) string { return "https://example.com/acmes/orders/FOOBAR/finalize" },
			"certificate":   func(*acmeClient) string { return "https://example.com/acmes/orders/FOOBAR/certificate" },
			"authorization": func(*acmeClient) string { return "https://example.com/acmes/auths/FOOBAR" },
			"challenge":     func(*acmeClient) string { return "https://example.com/acmes/challenges/FOOBAR" },
		}
		for _, e := range ownedEndpoints {
			t.Run(e.name+" when the url is not a URL", func(t *testing.T) {
				t.Parallel()

				// Setup
				c, o, ch := ownerWithOrder(t, p)
				url := e.url(c, o, ch)
				header := c.Header(t, url)
				header["url"] = "BAD"

				// Action
				res := c.PostRaw(t, url, header, []byte("{}"))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "malformed", "Invalid URL in the protected header")
			})

			t.Run(e.name+" when the url names another server", func(t *testing.T) {
				t.Parallel()

				// Setup
				c, o, ch := ownerWithOrder(t, p)
				url := e.url(c, o, ch)
				header := c.Header(t, url)
				header["url"] = elsewhere[e.name](c)

				// Action
				res := c.PostRaw(t, url, header, []byte("{}"))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "malformed", "URL mismatch in the protected header")
			})
		}
	})

	t.Run("should answer a body that is not a JWS with an ACME malformed problem", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, name := range append([]string{"new-account"}, accountEndpointNames...) {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)
				url := c.NewAccountURL()
				if name != "new-account" {
					url = accountEndpoints(t, c, c.NewOrder(t, domain("www")))[name]
				}

				// Action
				res := c.send(t, url, []byte(`{"protected":"x"}`))

				// Assert
				require.Equalf(t, http.StatusBadRequest, res.Status, "ACME answered %d: %s", res.Status, res.Body)
				require.Contains(t, res.Header.Get("Content-Type"), "application/problem+json")
				prob := res.Problem(t)
				require.Equal(t, "urn:ietf:params:acme:error:malformed", prob.Type)
				require.True(t, strings.HasPrefix(prob.Detail, "Invalid request: "), prob.Detail)
			})
		}
	})

	t.Run("should refuse a protected header carrying both a kid and a jwk", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, name := range accountEndpointNames {
			t.Run(name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)
				url := accountEndpoints(t, c, c.NewOrder(t, domain("www")))[name]
				header := c.Header(t, url)
				header["jwk"] = map[string]string{
					"n":   "mmEWxUv2lUYDZe_M2FXJ_WDXgHoEG7PVvg-dfz1STzyMwx0qvM66KMenXSyVA0r-_Ssb6p8VexSWGOFKskM4ryKUihn2KNH5e8nXZBqzqYeKQ8vqaCdaWzTxFI1dg0xhk0CWptkZHxpRpLalztFJ1Pq7L2qvQOM2YT7wPYbwQhpaSiVNXAb1W4FwAPyC04v1mHehvST-esaDT7j_5-eU5cCcmyi4_g5nBawcinOjj5o3VCg4X8UjK--AjhAyYHx1nRMr-7xk4x-0VIpQ_OODjLB3WzN8s1YEb0Jx5Bv1JyeCw35zahqs3fAFyRje-p5ENk9NCxfz5x9ZGkszkkNt0Q",
					"e":   "AQAB",
					"kty": "RSA",
				}

				// Action
				res := c.PostRaw(t, url, header, []byte("{}"))

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "malformed", "Both JWK and KID are provided in the protected header")
			})
		}
	})
}
