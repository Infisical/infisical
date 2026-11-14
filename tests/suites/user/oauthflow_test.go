package user_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// providers are the logins every provider-agnostic claim runs against.
var providers = []fixture.OAuthProvider{fixture.OAuthGoogle, fixture.OAuthGitHub, fixture.OAuthGitLab}

// accountOf follows a login that issued a session and reads the account it belongs to.
func accountOf(t *testing.T, tn *harness.Tenant, res fixture.OAuthResult) *api.GetCurrentUserV1Response {
	t.Helper()
	s := sessionFrom(t, tn, res)
	me, err := s.API.GetCurrentUserV1WithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, me.StatusCode(), "reading the account: %s", apierr.Body(me.Body))
	return me
}

// sessionFrom turns a login's refresh cookie into an org-less session, the way the
// select-organization page starts.
func sessionFrom(t *testing.T, tn *harness.Tenant, res fixture.OAuthResult) session {
	t.Helper()
	jid := cookieNamed(res.HTTP, "jid")
	require.NotNil(t, jid, "the login set no refresh cookie")
	ip := newIP()
	refreshed := refresh(t, tn, ip, jid)
	require.Equalf(t, http.StatusOK, refreshed.StatusCode(), "refreshing the session: %s", apierr.Body(refreshed.Body))
	return session{IP: ip, Token: refreshed.JSON200.Token, API: as(t, tn, refreshed.JSON200.Token, ip)}
}

// requireNoSession checks a callback started no session: it either refused outright or
// sent the browser to the provider error page.
func requireNoSession(t *testing.T, res fixture.OAuthResult) {
	t.Helper()
	require.Nil(t, cookieNamed(res.HTTP, "jid"))
	if res.Status == http.StatusFound {
		require.Equal(t, "/login/provider/error", res.Redirect(t).Path)
		return
	}
	require4xx(t, res.Status, res.Body)
}
