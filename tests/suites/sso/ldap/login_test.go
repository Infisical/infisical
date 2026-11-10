package ldap_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestLDAPLogin(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should send a new directory user to SSO signup and mail them a code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		uid, password, email := d.person(t, tn.Email("ldap-"+id.Short()))

		// Action
		res := login(t, tn, uid, password)

		// Assert
		loc := next(t, res)
		require.Equal(t, "/signup/sso", loc.Path)
		require.NotEmpty(t, loc.Query().Get("token"))
		require.Len(t, sso.VerificationCode(t, tn, email), 6)
	})

	t.Run("should accept the user into the org when signup completes with the mailed code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		uid, password, email := d.person(t, tn.Email("ldap-"+id.Short()))
		token := next(t, login(t, tn, uid, password)).Query().Get("token")
		code := sso.VerificationCode(t, tn, email)

		// Action
		res := completeSignup(t, tn, token, code)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		membership := fixture.MembershipOf(t, tn, email)
		require.NotNil(t, membership)
		require.Equal(t, "accepted", membership.Status)
	})

	t.Run("should refuse a wrong directory password and create no account", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		uid, _, email := d.person(t, tn.Email("ldap-"+id.Short()))

		// Action
		res := login(t, tn, uid, "not-the-password")

		// Assert
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Nil(t, fixture.MembershipOf(t, tn, email))
	})

	t.Run("should refuse a directory user whose email is not on a verified domain of the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		d := configured(t, tn)
		email := "outsider-" + id.Short() + "@unverified-" + id.Short() + ".test"
		uid, password, _ := d.person(t, email)

		// Action
		res := login(t, tn, uid, password)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "not a part of the accepted domains")
		require.Nil(t, fixture.MembershipOf(t, tn, email))
	})
}
