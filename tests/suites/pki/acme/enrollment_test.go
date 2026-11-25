package acme_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestAcmeEnrollment_Clear(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse registering with the profile's EAB credentials once ACME enrollment is cleared", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		clear, err := tn.Admin.API.ClearPkiApplicationAcmeEnrollmentWithResponse(t.Context(), p.app.ID, p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing ACME enrollment: %s", apierr.Body(clear.Body))
		c := p.client(t)

		// Action
		res := c.Register(t, p.eab)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.Status, "registering answered: %s", apierr.Body(res.Body))
		prob := res.Problem(t)
		require.Equal(t, "urn:ietf:params:acme:error:externalAccountRequired", prob.Type)
		require.Equal(t, "External account binding is not configured", prob.Detail)
		requireNoAccount(t, c)
	})
}

func TestAcmeEnrollment_RotateEab(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse the old EAB secret and register with the new one once it is rotated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)

		// Action
		res, err := tn.Admin.API.RotatePkiApplicationAcmeEabSecretWithResponse(t.Context(), p.app.ID, p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "rotating the EAB secret: %s", apierr.Body(res.Body))

		// Assert
		rotated := pki.RevealEAB(t, p.app, p.profile)
		require.NotEqual(t, p.eab.Secret, rotated.Secret)
		old := p.client(t)
		require.Equal(t, "Invalid external account binding JWS signature", old.Register(t, p.eab).Problem(t).Detail)
		requireNoAccount(t, old)
		p.client(t).MustRegister(t, rotated)
	})
}

func TestAcmeEnrollment_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse new orders from an account registered before ACME enrollment was cleared", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Clearing ACME enrollment turns ACME off for the profile, but new-order resolves the
			application from the account and never checks that its ACME configuration is still there, so an
			account registered before the clear keeps ordering.`)

		// Setup
		tn := h.NewTenant(t)
		p := newAcmeProfile(t, tn)
		c := p.registered(t)
		clear, err := tn.Admin.API.ClearPkiApplicationAcmeEnrollmentWithResponse(t.Context(), p.app.ID, p.profile.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, clear.StatusCode(), "clearing ACME enrollment: %s", apierr.Body(clear.Body))

		// Action
		res := c.Post(t, c.NewOrderURL(), map[string]any{"identifiers": []identifier{{Type: "dns", Value: domain("cleared")}}})

		// Assert
		require.GreaterOrEqualf(t, res.Status, http.StatusBadRequest, "new-order answered: %s", apierr.Body(res.Body))
		require.NotEmpty(t, res.Problem(t).Type)
	})
}

// requireNoAccount requires that the server kept no account for the client's key, which the client's
// own AccountURL cannot show: it is set only when registering succeeds.
func requireNoAccount(t *testing.T, c *acmeClient) {
	t.Helper()
	requireProblem(t, lookup(t, c), http.StatusNotFound, "accountDoesNotExist", "ACME account not found")
}
