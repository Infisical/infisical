package user_test

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	githubfake "github.com/Infisical/infisical/tests/fakes/github"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

type providerKind string

const (
	viaGoogle providerKind = "google"
	viaGitHub providerKind = "github"
	viaGitLab providerKind = "gitlab"
)

// providers are the logins every provider-agnostic claim runs against.
//
// Google is left out: passport-google-oauth20 sends the access token to
// www.googleapis.com/oauth2/v3/userinfo as an access_token query parameter, and
// fakes/oauth attributes profile calls only by the Authorization header, so every
// Google callback answers 500 until the fake reads the query parameter too.
var providers = []providerKind{viaGitHub, viaGitLab}

func skipUntilGoogleFakeAttributesQueryToken(t *testing.T) {
	t.Helper()
	t.Skip("fakes/oauth does not attribute www.googleapis.com/oauth2/v3/userinfo?access_token=..., " +
		"which is how passport-google-oauth20 sends the token, so the Google callback answers 500")
}

// browser is the half of an OAuth login the test drives: Infisical's redirect to the
// provider, and the provider's redirect back.
type browser struct {
	ip      string
	api     *api.ClientWithResponses
	cookies []*http.Cookie
	state   string
}

type startOption func(*startParams)

type startParams struct {
	callbackPort *string
	orgSlug      *string
}

func withCallbackPort(p string) startOption { return func(s *startParams) { s.callbackPort = &p } }
func withOrgSlug(slug string) startOption   { return func(s *startParams) { s.orgSlug = &slug } }

// startOAuth calls Infisical's redirect route and keeps what a browser would: the
// session cookie that carries state and the PKCE verifier, and the state itself.
func startOAuth(t *testing.T, tn *harness.Tenant, kind providerKind, opts ...startOption) *browser {
	t.Helper()
	var p startParams
	for _, o := range opts {
		o(&p)
	}
	ip := newIP()
	b := &browser{ip: ip, api: device(t, tn, ip, infisical.NoRedirects())}
	ctx := t.Context()

	var res *http.Response
	var body []byte
	switch kind {
	case viaGoogle:
		r, err := b.api.RedirectGoogleSSOWithResponse(ctx, &api.RedirectGoogleSSOParams{CallbackPort: p.callbackPort, OrgSlug: p.orgSlug})
		require.NoError(t, err)
		res, body = r.HTTPResponse, r.Body
	case viaGitHub:
		r, err := b.api.RedirectGitHubSSOWithResponse(ctx, &api.RedirectGitHubSSOParams{CallbackPort: p.callbackPort})
		require.NoError(t, err)
		res, body = r.HTTPResponse, r.Body
	case viaGitLab:
		r, err := b.api.RedirectGitLabSSOWithResponse(ctx, &api.RedirectGitLabSSOParams{CallbackPort: p.callbackPort})
		require.NoError(t, err)
		res, body = r.HTTPResponse, r.Body
	}
	require.Equalf(t, http.StatusFound, res.StatusCode, "starting %s login: %s", kind, apierr.Body(body))
	loc, err := url.Parse(res.Header.Get("Location"))
	require.NoError(t, err)
	b.state, b.cookies = loc.Query().Get("state"), res.Cookies()
	require.NotEmptyf(t, b.state, "the authorization redirect carries no state: %s", loc)
	return b
}

// callbackResult is Infisical's answer to the provider's redirect.
type callbackResult struct {
	Status int
	HTTP   *http.Response
	Body   []byte
}

// callback is the provider sending the browser back with a code and a state.
func (b *browser) callback(ctx context.Context, kind providerKind, code, state string, cookies ...*http.Cookie) (callbackResult, error) {
	editor := withCookies(cookies...)
	switch kind {
	case viaGoogle:
		r, err := b.api.GoogleLoginCallbackWithResponse(ctx, &api.GoogleLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return callbackResult{}, err
		}
		return callbackResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	case viaGitHub:
		r, err := b.api.GithubLoginCallbackWithResponse(ctx, &api.GithubLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return callbackResult{}, err
		}
		return callbackResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	default:
		r, err := b.api.GitlabLoginCallbackWithResponse(ctx, &api.GitlabLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return callbackResult{}, err
		}
		return callbackResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	}
}

// finish completes the round trip with the browser's own cookies and state.
func (b *browser) finish(t *testing.T, kind providerKind, cp *oauth.ControlPlane) callbackResult {
	t.Helper()
	res, err := b.callback(t.Context(), kind, cp.Code, b.state, b.cookies...)
	require.NoError(t, err)
	return res
}

// redirect is where the callback sent the browser.
func (r callbackResult) redirect(t *testing.T) *url.URL {
	t.Helper()
	require.Equalf(t, http.StatusFound, r.Status, "the callback did not redirect: %s", apierr.Body(r.Body))
	loc, err := url.Parse(r.HTTP.Header.Get("Location"))
	require.NoError(t, err)
	return loc
}

// person is who logs in at the provider: a stable provider account id, the address the
// provider asserts, and whether the provider vouches for it.
type person struct {
	ID       int64
	Email    string
	Verified bool
}

// newAccountID is a provider account id no other run has used: Infisical finds a
// returning provider login by this id across the whole instance.
func newAccountID() int64 {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	var n int64
	for _, x := range b {
		n = n<<8 | int64(x)
	}
	return n
}

func newPerson(tn *harness.Tenant, verified bool) person {
	return person{ID: newAccountID(), Email: tn.Email("x-" + id.Short()), Verified: verified}
}

// consent seeds the provider fake with a person who just consented, and returns the
// code the provider would put on the redirect.
func consent(t *testing.T, tn *harness.Tenant, kind providerKind, p person) *oauth.ControlPlane {
	t.Helper()
	switch kind {
	case viaGoogle:
		return oauth.LogIn(t, fixture.FakenetAdmin(t, tn), oauth.Google, oauth.Profile{
			Subject:       fmt.Sprintf("g-%d", p.ID),
			Email:         p.Email,
			EmailVerified: p.Verified,
			GivenName:     "Ada",
			FamilyName:    "Lovelace",
		})
	case viaGitLab:
		profile := oauth.Profile{ID: p.ID, Username: "ada", Name: "Ada", Email: p.Email}
		if p.Verified {
			profile.ConfirmedAt = "2024-01-01T00:00:00Z"
		}
		return oauth.LogIn(t, fixture.FakenetAdmin(t, tn), oauth.GitLab, profile)
	default:
		return consentGitHub(t, tn, p.ID, githubfake.Email{Email: p.Email, Primary: true, Verified: p.Verified})
	}
}

func consentGitHub(t *testing.T, tn *harness.Tenant, accountID int64, emails ...githubfake.Email) *oauth.ControlPlane {
	t.Helper()
	return oauth.LogInGitHub(t, fixture.FakenetAdmin(t, tn), oauth.GitHubUser{
		Login:  "ada",
		ID:     accountID,
		Name:   "Ada",
		Emails: emails,
	})
}

// oauthLogin is a whole login: start, consent, callback.
func oauthLogin(t *testing.T, tn *harness.Tenant, kind providerKind, p person, opts ...startOption) callbackResult {
	t.Helper()
	b := startOAuth(t, tn, kind, opts...)
	return b.finish(t, kind, consent(t, tn, kind, p))
}

// accountOf follows a login that issued a session and reads the account it belongs to.
func accountOf(t *testing.T, tn *harness.Tenant, res callbackResult) *api.GetCurrentUserV1Response {
	t.Helper()
	jid := cookieNamed(res.HTTP, "jid")
	require.NotNil(t, jid, "the login set no refresh cookie")
	ip := newIP()
	refreshed := refresh(t, tn, ip, jid)
	require.Equalf(t, http.StatusOK, refreshed.StatusCode(), "refreshing the session: %s", apierr.Body(refreshed.Body))
	me, err := as(t, tn, refreshed.JSON200.Token, ip).GetCurrentUserV1WithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, me.StatusCode(), "reading the account: %s", apierr.Body(me.Body))
	return me
}

// sessionFrom turns a login's refresh cookie into an org-less session, the way the
// select-organization page starts.
func sessionFrom(t *testing.T, tn *harness.Tenant, res callbackResult) session {
	t.Helper()
	jid := cookieNamed(res.HTTP, "jid")
	require.NotNil(t, jid, "the login set no refresh cookie")
	ip := newIP()
	refreshed := refresh(t, tn, ip, jid)
	require.Equalf(t, http.StatusOK, refreshed.StatusCode(), "refreshing the session: %s", apierr.Body(refreshed.Body))
	return session{IP: ip, Token: refreshed.JSON200.Token, API: as(t, tn, refreshed.JSON200.Token, ip)}
}
