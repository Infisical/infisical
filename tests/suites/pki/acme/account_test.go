package acme_test

import (
	"net/http"
	"regexp"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestAcmeAccount_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create an account under the profile when the EAB credentials are the profile's", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		c := p.client(t)

		// Action
		res := c.Register(t, p.eab)

		// Assert
		require.Equal(t, http.StatusCreated, res.Status)
		require.Regexp(t, "^"+regexp.QuoteMeta(c.URL(c.profilePath()+"/accounts/"))+".+$", c.AccountURL)
	})

	t.Run("should return the existing account with 200 when the same key registers again", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		first := p.registered(t)
		again := newClientWithKey(t, tn, p.app, p.profile, first.key)

		// Action
		res := again.Register(t, p.eab)

		// Assert
		require.Equal(t, http.StatusOK, res.Status)
		require.Equal(t, first.AccountURL, res.Header.Get("Location"))
	})

	t.Run("should refuse and create nothing when no external account binding is sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		c := p.client(t)

		// Action
		res := c.Post(t, c.NewAccountURL(), map[string]any{"contact": []string{"mailto:pki@harness.test"}})

		// Assert
		require.Equal(t, "urn:ietf:params:acme:error:externalAccountRequired", res.Problem(t).Type)
		require.NotEqual(t, http.StatusOK, lookup(t, c).Status, "the refused registration still created an account")
	})

	t.Run("should refuse external account binding credentials the profile did not issue", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		rows := []struct{ name, kid, secret, detail string }{
			{"when the kid is unknown and the secret is wrong", "bad", "Cg==", "Invalid external account binding JWS signature"},
			{"when the secret is a single byte", p.eab.KID, "Cg==", "Invalid external account binding JWS signature"},
			{"when the secret is another value", p.eab.KID, "YmFkLXNjcmV0Cg==", "Invalid external account binding JWS signature"},
			{"when the secret has bytes prepended", p.eab.KID, "ABC" + p.eab.Secret, "Invalid external account binding JWS signature"},
			{"when the kid is unknown", "bad", p.eab.Secret, "External account binding KID mismatch"},
			{"when the kid is another UUID", "4bc7959c-fe2d-4447-ae91-0cd893667af6", p.eab.Secret, "External account binding KID mismatch"},
		}
		for _, row := range rows {
			t.Run(row.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.client(t)

				// Action
				res := c.Post(t, c.NewAccountURL(), map[string]any{
					"contact":                []string{"mailto:pki@harness.test"},
					"externalAccountBinding": c.EAB(t, row.kid, row.secret, c.NewAccountURL()),
				})

				// Assert
				prob := res.Problem(t)
				require.Equal(t, "urn:ietf:params:acme:error:externalAccountRequired", prob.Type)
				require.Equal(t, row.detail, prob.Detail)
			})
		}
	})

	t.Run("should refuse external account binding signed for another URL", func(t *testing.T) {
		t.Parallel()
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		newAccount := p.client(t).NewAccountURL()

		rows := []struct{ name, url string }{
			{"when the path has a suffix", newAccount + "-bad"},
			{"when it carries a query", newAccount + "?foo=bar"},
			{"when it carries a fragment", newAccount + "#foobar"},
			{"when it is another path on the same origin", p.client(t).URL("/acme/new-account")},
			{"when it is on another origin", "https://example.com/api/v1/cert-manager/acme/applications/" + p.app.ID.String() + "/profiles/" + p.profile.ID.String() + "/new-account-bad"},
			{"when it is not a URL", "bad"},
		}
		for _, row := range rows {
			t.Run(row.name, func(t *testing.T) {
				t.Parallel()

				// Setup
				c := p.client(t)

				// Action
				res := c.Post(t, c.NewAccountURL(), map[string]any{
					"contact":                []string{"mailto:pki@harness.test"},
					"externalAccountBinding": c.EAB(t, p.eab.KID, p.eab.Secret, row.url),
				})

				// Assert
				prob := res.Problem(t)
				require.Equal(t, "urn:ietf:params:acme:error:externalAccountRequired", prob.Type)
				require.Equal(t, "External account binding URL mismatch", prob.Detail)
			})
		}
	})
}

func TestAcmeAccount_Lookup(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should find the account by its key alone, without external account binding", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `cert-manager's ACME issuer looks its account up with onlyReturnExisting and no EAB,
			so the lookup has to work without one.`)

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		registered := p.registered(t)
		c := newClientWithKey(t, tn, p.app, p.profile, registered.key)

		// Action
		res := lookup(t, c)

		// Assert
		require.Equal(t, http.StatusOK, res.Status)
		require.Equal(t, registered.AccountURL, res.Header.Get("Location"))
	})
}

// lookup asks new-account for the key's existing account and nothing else.
func lookup(t *testing.T, c *acmeClient) acmeResponse {
	t.Helper()
	return c.Post(t, c.NewAccountURL(), map[string]any{"onlyReturnExisting": true})
}
