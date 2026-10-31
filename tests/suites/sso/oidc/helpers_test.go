package oidc_test

import (
	"context"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func setup(t *testing.T) *sso.OIDC {
	t.Helper()
	return sso.NewOIDC(t, harness.From(t).NewTenant(t))
}

// signedUp logs a new person in through OIDC and completes their signup, leaving an
// accepted member with a verified OIDC account.
func signedUp(t *testing.T, o *sso.OIDC) oidcidp.Person {
	t.Helper()
	person := o.Person()
	login := o.Login(t, person)
	res := o.CompleteSignup(t, login, sso.VerificationCode(t, o.Tenant, person.Email))
	require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
	return person
}

// enforce makes OIDC the org's required login, which needs one OIDC login first.
func enforce(t *testing.T, o *sso.OIDC) {
	t.Helper()
	signedUp(t, o)
	sso.Enforce(t, o.Tenant)
}

// startLogin begins a login the way the login page does and returns the state Infisical
// put on the authorization redirect, with the session cookie it set.
func startLogin(t *testing.T, o *sso.OIDC) (string, []*http.Cookie) {
	t.Helper()
	res, err := o.Browser.RedirectOidcLoginWithResponse(t.Context(), &api.RedirectOidcLoginParams{OrgSlug: new(o.Tenant.OrgSlug)})
	require.NoError(t, err)
	require.Equalf(t, http.StatusFound, res.StatusCode(), "starting OIDC login: %s", apierr.Body(res.Body))
	authorize, err := url.Parse(res.HTTPResponse.Header.Get("Location"))
	require.NoError(t, err)
	state := authorize.Query().Get("state")
	require.NotEmpty(t, state)
	return state, res.HTTPResponse.Cookies()
}

func callback(t *testing.T, o *sso.OIDC, code, state string, cookies []*http.Cookie) *api.OidcCallbackResponse {
	t.Helper()
	res, err := o.Browser.OidcCallbackWithResponse(t.Context(),
		&api.OidcCallbackParams{Code: new(code), State: new(state)},
		func(_ context.Context, req *http.Request) error {
			for _, c := range cookies {
				req.AddCookie(c)
			}
			return nil
		})
	require.NoError(t, err)
	return res
}

func readOrg(t *testing.T, session *api.ClientWithResponses, tn *harness.Tenant) int {
	t.Helper()
	res, err := session.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	return res.StatusCode()
}

func authEnforced(t *testing.T, tn *harness.Tenant) bool {
	t.Helper()
	res, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the org: %s", apierr.Body(res.Body))
	return res.JSON200.Organization.AuthEnforced != nil && *res.JSON200.Organization.AuthEnforced
}
