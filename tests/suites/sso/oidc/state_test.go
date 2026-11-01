package oidc_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestOIDCState(t *testing.T) {
	t.Parallel()

	t.Run("should refuse the callback without a session when the state was not issued by Infisical", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		_, cookies := startLogin(t, o)
		alice := o.Person()

		// Action
		res := callback(t, o, o.OP.LogIn(t, alice), "forged-state", cookies)

		// Assert
		require.Equal(t, http.StatusFound, res.StatusCode())
		require.Equal(t, "/api/v1/sso/oidc/login/error", res.HTTPResponse.Header.Get("Location"))
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, o.Tenant, alice.Email))
	})

	t.Run("should refuse the callback without a session when a used state is replayed", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		state, cookies := startLogin(t, o)
		first := callback(t, o, o.OP.LogIn(t, o.Person()), state, cookies)
		require.Equalf(t, http.StatusFound, first.StatusCode(), "first callback: %s", first.Body)
		mallory := o.Person()

		// Action
		res := callback(t, o, o.OP.LogIn(t, mallory), state, cookies)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", res.Body)
		require.Equal(t, "Your OIDC login session has expired or was not started. Start the login again.", apierr.Message(res.Body))
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, o.Tenant, mallory.Email))
	})

	t.Run("should refuse the callback without a session when the login session cookie is missing", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		state, _ := startLogin(t, o)
		alice := o.Person()

		// Action
		res := callback(t, o, o.OP.LogIn(t, alice), state, nil)

		// Assert
		require.NotEqual(t, http.StatusFound, res.StatusCode())
		require.Nil(t, sso.RefreshCookie(res.HTTPResponse))
		require.Nil(t, fixture.MembershipOf(t, o.Tenant, alice.Email))
	})
}

func TestOIDCState_Session(t *testing.T) {
	t.Parallel()

	t.Run("should refuse a replayed state once the login has completed", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		state, cookies := startLogin(t, o)
		first := callback(t, o, o.OP.LogIn(t, o.Person()), state, cookies)
		require.Equalf(t, http.StatusFound, first.StatusCode(), "first callback: %s", first.Body)

		// Action
		res := callback(t, o, o.OP.LogIn(t, o.Person()), state, cookies)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", res.Body)
		require.Equal(t, "Your OIDC login session has expired or was not started. Start the login again.", apierr.Message(res.Body))
	})

	t.Run("should refuse a callback without the login session cookie", func(t *testing.T) {
		t.Parallel()

		// Setup
		o := setup(t)
		state, _ := startLogin(t, o)

		// Action
		res := callback(t, o, o.OP.LogIn(t, o.Person()), state, nil)

		// Assert
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", res.Body)
		require.Equal(t, "Your OIDC login session has expired or was not started. Start the login again.", apierr.Message(res.Body))
	})
}
