package sso

import (
	"context"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oidcidp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// OIDC is a tenant with OIDC configured against its own provider in fakenet.
type OIDC struct {
	Tenant  *harness.Tenant
	OP      *oidcidp.ControlPlane
	SiteURL string
	Browser *api.ClientWithResponses
}

// NewOIDC verifies the tenant's mail domain and configures OIDC by discovery URL.
func NewOIDC(tt *testing.T, tn *harness.Tenant) *OIDC {
	tt.Helper()
	fixture.VerifiedEmailDomain(tt, tn)
	return NewOIDCConfig(tt, tn)
}

// NewOIDCConfig configures OIDC for a tenant whose mail domain is already verified,
// such as one moving off SAML.
func NewOIDCConfig(tt *testing.T, tn *harness.Tenant) *OIDC {
	tt.Helper()
	scope := "t-" + id.Short()
	clientID, secret := "infisical-"+id.Short(), id.Short()+id.Short()
	op := oidcidp.Open(tt, fixture.FakenetAdmin(tt, tn), scope)
	op.Seed(tt, oidcidp.Client(clientID, secret))

	res, err := tn.Admin.API.CreateOidcConfigWithResponse(tt.Context(), api.CreateOidcConfigJSONRequestBody{
		OrganizationId:    tn.OrgID.String(),
		ConfigurationType: api.CreateOidcConfigJSONBodyConfigurationTypeDiscoveryURL,
		DiscoveryURL:      new(oidcidp.IssuerURL(scope) + "/.well-known/openid-configuration"),
		ClientId:          clientID,
		ClientSecret:      secret,
		IsActive:          true,
	})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating OIDC config: %s", apierr.Body(res.Body))

	return &OIDC{
		Tenant:  tn,
		OP:      op,
		SiteURL: harness.From(tt).App().SiteURL(),
		Browser: tn.Anonymous(tt, infisical.NoRedirects()),
	}
}

func (o *OIDC) Person() oidcidp.Person {
	return oidcidp.Person{
		Subject:       "sub-" + id.Short(),
		Email:         o.Tenant.Email("user-" + id.Short()),
		EmailVerified: true,
		GivenName:     "Ada",
		FamilyName:    "Lovelace",
	}
}

// Login starts at Infisical's login route, logs p in at the provider, and returns
// Infisical's answer to the callback.
func (o *OIDC) Login(tt *testing.T, p oidcidp.Person) *api.OidcCallbackResponse {
	tt.Helper()
	ctx := tt.Context()

	start, err := o.Browser.RedirectOidcLoginWithResponse(ctx, &api.RedirectOidcLoginParams{OrgSlug: new(o.Tenant.OrgSlug)})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusFound, start.StatusCode(), "starting OIDC login: %s", apierr.Body(start.Body))
	authorize, err := url.Parse(start.HTTPResponse.Header.Get("Location"))
	require.NoError(tt, err)
	cookies := start.HTTPResponse.Cookies()

	code := o.OP.LogIn(tt, p)
	res, err := o.Browser.OidcCallbackWithResponse(ctx,
		&api.OidcCallbackParams{Code: new(code), State: new(authorize.Query().Get("state"))},
		func(_ context.Context, req *http.Request) error {
			for _, c := range cookies {
				req.AddCookie(c)
			}
			return nil
		})
	require.NoError(tt, err)
	return res
}

// Redirect is where the callback sent the browser, relative to SITE_URL.
func (o *OIDC) Redirect(tt *testing.T, res *api.OidcCallbackResponse) *url.URL {
	tt.Helper()
	require.Equalf(tt, http.StatusFound, res.StatusCode(), "OIDC callback did not redirect: %s", apierr.Body(res.Body))
	return siteRedirect(tt, o.SiteURL, res.HTTPResponse)
}

func (o *OIDC) SignupClaims(tt *testing.T, res *api.OidcCallbackResponse) map[string]any {
	tt.Helper()
	return signupClaims(tt, o.Redirect(tt, res))
}

func (o *OIDC) Session(tt *testing.T, res *api.OidcCallbackResponse) *api.ClientWithResponses {
	tt.Helper()
	return Session(tt, o.Tenant, res.HTTPResponse)
}

func (o *OIDC) CompleteSignup(tt *testing.T, res *api.OidcCallbackResponse, code string) *api.CompleteAccountSignupV3Response {
	tt.Helper()
	o.Redirect(tt, res)
	return CompleteSignup(tt, o.Tenant, res.HTTPResponse, code)
}
