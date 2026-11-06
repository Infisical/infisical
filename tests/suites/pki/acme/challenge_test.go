package acme_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestAcmeChallenge_Validate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue the certificate once the HTTP-01 key authorization is served", func(t *testing.T) {
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
		cert := issue(t, c, o, newCSR(t, name))

		// Assert
		require.Equal(t, name, cert.Subject.CommonName)
	})

	t.Run("should issue the certificate once the DNS-01 TXT record is published", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		name := domain("www")
		o := c.NewOrder(t, name)
		ch := c.Authorization(t, o.Authorizations[0]).Challenge(t, "dns-01")
		fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), "_acme-challenge."+name, c.DNSValue(ch.Token))
		c.Respond(t, ch)
		waitOrder(t, c, o.URL, "ready")

		// Action
		cert := issue(t, c, o, newCSR(t, name))

		// Assert
		require.Equal(t, name, cert.Subject.CommonName)
	})

	t.Run("should validate on a retry when the first fetch of the key authorization fails", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Validation runs on a queue with retries, so a web server that is briefly unavailable
			must not fail the order. The retry backs off 30 seconds, which is why the wait is longer than usual.`)

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		o := c.NewOrder(t, site.Name("www"))
		site.Fail(t, http.MethodGet, "/.well-known/acme-challenge/*", http.StatusServiceUnavailable, fakenet.Times(1))

		// Action
		passHTTP01(t, c, site, o.Authorizations)

		// Assert
		waitOrder(t, c, o.URL, "ready", timeout(90*time.Second))
		require.Len(t, site.Calls(t), 2, "Infisical did not fetch the key authorization a second time")
	})

	t.Run("should issue for every name once each one's HTTP-01 challenge passes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		cn, sans := site.Name("www"), []string{site.Name("api"), site.Name("mail")}
		o := c.NewOrder(t, append([]string{cn}, sans...)...)
		passHTTP01(t, c, site, o.Authorizations)
		waitOrder(t, c, o.URL, "ready")

		// Action
		cert := issue(t, c, o, newCSR(t, cn, sans...))

		// Assert
		require.Equal(t, cn, cert.Subject.CommonName)
		require.ElementsMatch(t, sans, cert.DNSNames)
	})

	t.Run("should refuse to finalize and keep the order pending while one name is unvalidated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn).registered(t)
		site := newSite(t, tn)
		o := c.NewOrder(t, site.Name("www"), site.Name("api"))
		solved, unsolved := authorizationFor(t, c, o, site.Name("www")), authorizationFor(t, c, o, site.Name("api"))
		passHTTP01(t, c, site, []string{solved})
		waitAuthorization(t, c, solved, "valid")

		// Action
		res := c.Finalize(t, o.Finalize, newCSR(t, "", site.Name("www"), site.Name("api")))

		// Assert
		requireProblem(t, res, http.StatusBadRequest, "orderNotReady", "ACME order is not ready")
		require.Equal(t, "pending", c.Authorization(t, unsolved).Status)
		require.Equal(t, "pending", c.Order(t, o.URL).Status)
	})

	t.Run("should make the order ready without challenges when DNS ownership verification is skipped", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		c := newAcmeProfile(t, tn, pki.SkipDNSOwnershipVerification()).registered(t)
		name := domain("www")

		// Action
		o := c.NewOrder(t, name)

		// Assert
		require.Equal(t, "ready", o.Status)
		require.Equal(t, name, issue(t, c, o, newCSR(t, name)).Subject.CommonName)
	})
}

// authorizationFor is the URL of an order's authorization for one name.
func authorizationFor(t *testing.T, c *acmeClient, o Order, name string) string {
	t.Helper()
	for _, url := range o.Authorizations {
		if c.Authorization(t, url).Identifier.Value == name {
			return url
		}
	}
	t.Fatalf("the order has no authorization for %s", name)
	return ""
}

func waitAuthorization(t *testing.T, c *acmeClient, url, status string) {
	t.Helper()
	wait.Until(t, "the authorization to become "+status, func() bool {
		return c.Authorization(t, url).Status == status
	}, pollACME)
}
