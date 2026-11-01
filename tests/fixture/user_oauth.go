package fixture

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
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// OAuthProvider is one of the OAuth providers Infisical offers as user login.
type OAuthProvider string

const (
	OAuthGoogle OAuthProvider = "google"
	OAuthGitHub OAuthProvider = "github"
	OAuthGitLab OAuthProvider = "gitlab"
)

// OAuthPerson is who logs in at the provider: a stable provider account id, the address
// the provider asserts, and whether the provider vouches for it.
type OAuthPerson struct {
	ID       int64
	Email    string
	Verified bool
}

// NewOAuthPerson is a provider account no other test or run has used, on the tenant's
// mail domain.
func NewOAuthPerson(tn *harness.Tenant, verified bool) OAuthPerson {
	return OAuthPerson{ID: NewOAuthAccountID(), Email: tn.Email("x-" + id.Short()), Verified: verified}
}

// NewOAuthAccountID is a provider account id no other run has used: Infisical finds a
// returning provider login by this id across the whole instance. 48 bits, so it stays
// exact as a JavaScript number.
func NewOAuthAccountID() int64 {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	var n int64
	for _, x := range b {
		n = n<<8 | int64(x)
	}
	return n
}

// OAuthBrowser is the half of an OAuth login a test drives: Infisical's redirect to the
// provider, and the provider's redirect back. It keeps what a browser would: the session
// cookie that carries state and the PKCE verifier, and the state itself.
type OAuthBrowser struct {
	IP      string
	Cookies []*http.Cookie
	State   string
	// Challenge is the PKCE challenge on the authorization redirect, which the provider
	// checks the token request's verifier against.
	Challenge string
	api       *api.ClientWithResponses
}

type OAuthStartOption func(*oauthStart)

type oauthStart struct {
	callbackPort *string
	orgSlug      *string
}

func WithOAuthCallbackPort(p string) OAuthStartOption {
	return func(s *oauthStart) { s.callbackPort = &p }
}

// WithOAuthOrgSlug names the organization on the redirect. Only Google takes it.
func WithOAuthOrgSlug(slug string) OAuthStartOption {
	return func(s *oauthStart) { s.orgSlug = &slug }
}

// StartOAuth calls Infisical's redirect route from a fresh address.
func StartOAuth(tt *testing.T, tn *harness.Tenant, kind OAuthProvider, opts ...OAuthStartOption) *OAuthBrowser {
	tt.Helper()
	var p oauthStart
	for _, o := range opts {
		o(&p)
	}
	b := &OAuthBrowser{IP: oauthIP()}
	b.api = tn.Anonymous(tt, infisical.ForwardedFor(b.IP), infisical.NoRedirects())
	ctx := tt.Context()

	var res *http.Response
	var body []byte
	switch kind {
	case OAuthGoogle:
		r, err := b.api.RedirectGoogleSSOWithResponse(ctx, &api.RedirectGoogleSSOParams{CallbackPort: p.callbackPort, OrgSlug: p.orgSlug})
		require.NoError(tt, err)
		res, body = r.HTTPResponse, r.Body
	case OAuthGitHub:
		r, err := b.api.RedirectGitHubSSOWithResponse(ctx, &api.RedirectGitHubSSOParams{CallbackPort: p.callbackPort})
		require.NoError(tt, err)
		res, body = r.HTTPResponse, r.Body
	case OAuthGitLab:
		r, err := b.api.RedirectGitLabSSOWithResponse(ctx, &api.RedirectGitLabSSOParams{CallbackPort: p.callbackPort})
		require.NoError(tt, err)
		res, body = r.HTTPResponse, r.Body
	}
	require.Equalf(tt, http.StatusFound, res.StatusCode, "starting %s login: %s", kind, apierr.Body(body))
	loc, err := url.Parse(res.Header.Get("Location"))
	require.NoError(tt, err)
	b.State, b.Cookies = loc.Query().Get("state"), res.Cookies()
	require.NotEmptyf(tt, b.State, "the authorization redirect carries no state: %s", loc)
	b.Challenge = loc.Query().Get("code_challenge")
	require.NotEmptyf(tt, b.Challenge, "the authorization redirect carries no PKCE challenge: %s", loc)
	require.Equal(tt, "S256", loc.Query().Get("code_challenge_method"))
	return b
}

// OAuthResult is Infisical's answer to the provider's redirect.
type OAuthResult struct {
	Status int
	HTTP   *http.Response
	Body   []byte
}

// Redirect is where the callback sent the browser.
func (r OAuthResult) Redirect(tt *testing.T) *url.URL {
	tt.Helper()
	require.Equalf(tt, http.StatusFound, r.Status, "the callback did not redirect: %s", apierr.Body(r.Body))
	loc, err := url.Parse(r.HTTP.Header.Get("Location"))
	require.NoError(tt, err)
	return loc
}

// Callback is the provider sending the browser back with a code and a state, carrying
// whichever cookies the test chooses. It returns the transport error rather than failing,
// so a test can bound a callback that never answers.
func (b *OAuthBrowser) Callback(ctx context.Context, kind OAuthProvider, code, state string, cookies ...*http.Cookie) (OAuthResult, error) {
	editor := func(_ context.Context, req *http.Request) error {
		for _, c := range cookies {
			req.AddCookie(c)
		}
		return nil
	}
	switch kind {
	case OAuthGoogle:
		r, err := b.api.GoogleLoginCallbackWithResponse(ctx, &api.GoogleLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return OAuthResult{}, err
		}
		return OAuthResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	case OAuthGitHub:
		r, err := b.api.GithubLoginCallbackWithResponse(ctx, &api.GithubLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return OAuthResult{}, err
		}
		return OAuthResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	default:
		r, err := b.api.GitlabLoginCallbackWithResponse(ctx, &api.GitlabLoginCallbackParams{Code: new(code), State: new(state)}, editor)
		if err != nil {
			return OAuthResult{}, err
		}
		return OAuthResult{r.StatusCode(), r.HTTPResponse, r.Body}, nil
	}
}

// Finish completes the round trip with the browser's own cookies and state.
func (b *OAuthBrowser) Finish(tt *testing.T, kind OAuthProvider, cp *oauth.ControlPlane) OAuthResult {
	tt.Helper()
	cp.Seed(tt, oauth.Grant{CodeChallenge: b.Challenge})
	res, err := b.Callback(tt.Context(), kind, cp.Code, b.State, b.Cookies...)
	require.NoError(tt, err)
	return res
}

// OAuthConsent seeds the provider fake with a person who just consented, and returns
// the code the provider would put on the redirect.
func OAuthConsent(tt *testing.T, tn *harness.Tenant, kind OAuthProvider, p OAuthPerson) *oauth.ControlPlane {
	tt.Helper()
	switch kind {
	case OAuthGoogle:
		return oauth.LogIn(tt, FakenetAdmin(tt, tn), oauth.Google, oauth.Profile{
			Subject:       fmt.Sprintf("g-%d", p.ID),
			Email:         p.Email,
			EmailVerified: p.Verified,
			GivenName:     "Ada",
			FamilyName:    "Lovelace",
		})
	case OAuthGitLab:
		profile := oauth.Profile{ID: p.ID, Username: "ada", Name: "Ada", Email: p.Email}
		if p.Verified {
			profile.ConfirmedAt = "2024-01-01T00:00:00Z"
		}
		return oauth.LogIn(tt, FakenetAdmin(tt, tn), oauth.GitLab, profile)
	default:
		return OAuthConsentGitHub(tt, tn, p.ID, githubfake.Email{Email: p.Email, Primary: true, Verified: p.Verified})
	}
}

// OAuthConsentGitHub is a GitHub consent with the account's email list spelled out.
func OAuthConsentGitHub(tt *testing.T, tn *harness.Tenant, accountID int64, emails ...githubfake.Email) *oauth.ControlPlane {
	tt.Helper()
	return oauth.LogInGitHub(tt, FakenetAdmin(tt, tn), oauth.GitHubUser{
		Login:  "ada",
		ID:     accountID,
		Name:   "Ada",
		Emails: emails,
	})
}

// OAuthLogin is a whole login: start, consent, callback.
func OAuthLogin(tt *testing.T, tn *harness.Tenant, kind OAuthProvider, p OAuthPerson, opts ...OAuthStartOption) OAuthResult {
	tt.Helper()
	b := StartOAuth(tt, tn, kind, opts...)
	return b.Finish(tt, kind, OAuthConsent(tt, tn, kind, p))
}

// oauthIP gives each login its own rate-limit bucket and, to Infisical, its own device.
func oauthIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}
