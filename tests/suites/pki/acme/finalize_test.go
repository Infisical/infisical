package acme_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAcmeOrder_Finalize(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue without a common name when the CSR names the host only as a SAN", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		name := site.Name("www")
		o := c.NewOrder(t, name)
		passHTTP01(t, c, site, o.Authorizations)
		waitOrder(t, c, o.URL, "ready")

		// Action
		cert := issue(t, c, o, newCSR(t, "", name))

		// Assert
		require.Empty(t, cert.Subject.CommonName)
		require.Equal(t, []string{name}, cert.DNSNames)
	})

	t.Run("should refuse and leave the order ready when the CSR names differ from the order", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		o := c.NewOrder(t, site.Name("www"), site.Name("api"))
		passHTTP01(t, c, site, o.Authorizations)
		waitOrder(t, c, o.URL, "ready")

		// Action
		res := c.Finalize(t, o.Finalize, newCSR(t, site.Name("other")))

		// Assert
		requireProblem(t, res, http.StatusBadRequest, "badCSR", "Invalid CSR: Common name + SANs mismatch with order identifiers")
		require.Equal(t, "ready", c.Order(t, o.URL).Status)
	})
}
