package acme_test

import (
	"net/http"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// requirePendingOrder checks the shape of a new order for one name.
func requirePendingOrder(t *testing.T, c *acmeClient, url string, o orderBody, name string) {
	t.Helper()
	orders := regexp.QuoteMeta(c.URL(c.profilePath() + "/orders/"))
	require.Regexp(t, "^"+orders+"[^/]+$", url)
	require.Equal(t, "pending", o.Status)
	require.Equal(t, []identifier{{Type: "dns", Value: name}}, o.Identifiers)
	require.Regexp(t, "^"+orders+"[^/]+/finalize$", o.Finalize)
	require.NotEmpty(t, o.Authorizations)
	for _, a := range o.Authorizations {
		require.True(t, strings.HasPrefix(a, c.URL(c.profilePath()+"/authorizations/")), a)
	}
}

func TestAcmeOrder_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should open a pending order for the name with one authorization per identifier", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		name := domain("www")

		// Action
		o := c.NewOrder(t, name)

		// Assert
		requirePendingOrder(t, c, o.URL, o.orderBody, name)
	})

	t.Run("should carry every name when the order asks for several", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		names := []string{domain("www"), domain("api"), domain("mail")}

		// Action
		o := c.NewOrder(t, names...)

		// Assert
		got := make([]string, 0, len(o.Identifiers))
		for _, id := range o.Identifiers {
			require.Equal(t, "dns", id.Type)
			got = append(got, id.Value)
		}
		slices.Sort(got)
		slices.Sort(names)
		require.Equal(t, names, got)
	})

	t.Run("should refuse identifier types other than DNS and IP", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, kind := range []string{"bad", "email"} {
			t.Run(kind, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)

				// Action
				res := c.Post(t, c.NewOrderURL(), map[string]any{"identifiers": []identifier{{Type: kind, Value: "www.example.org"}}})

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "unsupportedIdentifier", "Only DNS and IP identifiers are supported")
				require.Empty(t, listOrders(t, c), "the refused order was still created")
			})
		}
	})

	t.Run("should refuse a DNS identifier that is not a hostname", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		for _, value := range []string{"127.0.0.1", "192.168.123.111", "169.254.169.254", "../../etc/passwd", "!@#$", "!", "https://evil.com"} {
			t.Run(value, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.registered(t)

				// Action
				res := c.Post(t, c.NewOrderURL(), map[string]any{"identifiers": []identifier{{Type: "dns", Value: value}}})

				// Assert
				requireProblem(t, res, http.StatusBadRequest, "unsupportedIdentifier", "Invalid DNS identifier")
				require.Empty(t, listOrders(t, c), "the refused order was still created")
			})
		}
	})
}

func TestAcmeOrder_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the order as it was created", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		name := domain("www")
		created := c.NewOrder(t, name)

		// Action
		o := c.Order(t, created.URL)

		// Assert
		requirePendingOrder(t, c, created.URL, o, name)
	})
}

// listOrders is the account's order URLs.
func listOrders(t *testing.T, c *acmeClient) []string {
	t.Helper()
	var out struct {
		Orders []string `json:"orders"`
	}
	c.Post(t, c.OrdersURL(), map[string]any{}).Decode(t, http.StatusOK, &out)
	return out.Orders
}
