// Package sso logs people into a tenant through its identity provider, the way a
// browser does, for any suite whose claim depends on an SSO session.
package sso

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/samlidp"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	Okta   = api.CreateSamlConfigJSONBodyAuthProviderOktaSaml
	Azure  = api.CreateSamlConfigJSONBodyAuthProviderAzureSaml
	Google = api.CreateSamlConfigJSONBodyAuthProviderGoogleSaml
)

// SAML is a tenant with SAML configured against its own IdP, and a browser to log in
// through it. The browser stops at redirects, because the redirect is the outcome.
type SAML struct {
	Tenant   *harness.Tenant
	IdP      *samlidp.IdP
	ConfigID uuid.UUID
	Issuer   string
	SiteURL  string
	Browser  *api.ClientWithResponses
}

// NewSAML verifies the tenant's mail domain and configures SAML against a new IdP.
func NewSAML(tt *testing.T, tn *harness.Tenant, provider api.CreateSamlConfigJSONBodyAuthProvider) *SAML {
	tt.Helper()
	fixture.VerifiedEmailDomain(tt, tn)
	idp := samlidp.New(tt)
	body := SAMLConfigBody(tn, idp, provider)
	return &SAML{
		Tenant:   tn,
		IdP:      idp,
		ConfigID: CreateSAMLConfig(tt, tn, body),
		Issuer:   body.Issuer,
		SiteURL:  harness.From(tt).App().SiteURL(),
		Browser:  tn.Anonymous(tt, infisical.NoRedirects()),
	}
}

func CreateSAMLConfig(tt *testing.T, tn *harness.Tenant, body api.CreateSamlConfigJSONRequestBody) uuid.UUID {
	tt.Helper()
	res, err := tn.Admin.API.CreateSamlConfigWithResponse(tt.Context(), body)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating SAML config: %s", apierr.Body(res.Body))
	return res.JSON200.Id
}

func SAMLConfigBody(tn *harness.Tenant, idp *samlidp.IdP, provider api.CreateSamlConfigJSONBodyAuthProvider) api.CreateSamlConfigJSONRequestBody {
	return api.CreateSamlConfigJSONRequestBody{
		OrganizationId: tn.OrgID.String(),
		AuthProvider:   provider,
		IsActive:       true,
		EntryPoint:     idp.EntryPoint,
		Issuer:         "infisical-" + id.Short(),
		Cert:           idp.CertPEM(),
	}
}

// Person is someone the IdP asserts, on the tenant's verified domain.
func (s *SAML) Person() samlidp.Response {
	return samlidp.Response{
		Email:     s.Tenant.Email("user-" + id.Short()),
		FirstName: "Ada",
		LastName:  "Lovelace",
	}
}

// StartLogin begins an SP-initiated login the way the login page does.
func (s *SAML) StartLogin(tt *testing.T, params *api.RedirectSamlByOrgSlugParams) samlidp.Request {
	tt.Helper()
	res, err := s.Browser.RedirectSamlByOrgSlugWithResponse(tt.Context(), s.Tenant.OrgSlug, params)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusFound, res.StatusCode(), "starting SAML login: %s", apierr.Body(res.Body))
	return s.IdP.ParseRedirect(tt, res.HTTPResponse.Header.Get("Location"))
}

// SPLogin runs an SP-initiated login end to end and returns the ACS answer. The
// response answers the request Infisical made unless r says otherwise.
func (s *SAML) SPLogin(tt *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	tt.Helper()
	return s.Answer(tt, s.StartLogin(tt, nil), r)
}

// Answer posts the IdP's response to a request Infisical made.
func (s *SAML) Answer(tt *testing.T, req samlidp.Request, r samlidp.Response) *api.SamlAcsResponse {
	tt.Helper()
	r.Destination = req.ACSURL
	r.InResponseTo = req.ID
	r.RelayState = req.RelayState
	return s.Post(tt, r)
}

// IdPLogin posts an unsolicited response, as an IdP tile in the user's dashboard does.
func (s *SAML) IdPLogin(tt *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	tt.Helper()
	r.Destination = s.SiteURL + "/api/v1/sso/saml2/" + s.ConfigID.String()
	return s.Post(tt, r)
}

func (s *SAML) Post(tt *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	tt.Helper()
	if r.Audience == "" {
		r.Audience = s.SiteURL
	}
	return s.ACS(tt, s.ConfigID, s.IdP.Respond(tt, r))
}

func (s *SAML) ACS(tt *testing.T, configID uuid.UUID, form url.Values) *api.SamlAcsResponse {
	tt.Helper()
	body := api.SamlAcsFormdataRequestBody{SAMLResponse: new(form.Get("SAMLResponse"))}
	if relay := form.Get("RelayState"); relay != "" {
		body.RelayState = new(relay)
	}
	res, err := s.Browser.SamlAcsWithFormdataBodyWithResponse(tt.Context(), configID.String(), body)
	require.NoError(tt, err)
	return res
}

// Redirect is where the ACS sent the browser, relative to SITE_URL.
func (s *SAML) Redirect(tt *testing.T, res *api.SamlAcsResponse) *url.URL {
	tt.Helper()
	require.Equalf(tt, http.StatusFound, res.StatusCode(), "ACS did not redirect: %s", apierr.Body(res.Body))
	return siteRedirect(tt, s.SiteURL, res.HTTPResponse)
}

// SignupClaims decodes the signup token the ACS handed the SSO signup page.
func (s *SAML) SignupClaims(tt *testing.T, res *api.SamlAcsResponse) map[string]any {
	tt.Helper()
	return signupClaims(tt, s.Redirect(tt, res))
}

// Session turns the refresh cookie from a SAML login into an org-scoped client, the
// way the select-organization page does.
func (s *SAML) Session(tt *testing.T, res *api.SamlAcsResponse) *api.ClientWithResponses {
	tt.Helper()
	return Session(tt, s.Tenant, res.HTTPResponse)
}

// VerificationCode is the code Infisical mails a user whose SSO account it has not
// verified yet.
func (s *SAML) VerificationCode(tt *testing.T, email string) string {
	tt.Helper()
	return VerificationCode(tt, s.Tenant, email)
}

// CompleteSignup finishes SSO signup with the mailed code, as the SSO signup page
// does, and returns the response.
func (s *SAML) CompleteSignup(tt *testing.T, acs *api.SamlAcsResponse, code string) *api.CompleteAccountSignupV3Response {
	tt.Helper()
	s.Redirect(tt, acs)
	return CompleteSignup(tt, s.Tenant, acs.HTTPResponse, code)
}

// SignedUp logs a new person in through SAML and completes their signup, leaving an
// accepted member with a verified SAML account.
func (s *SAML) SignedUp(tt *testing.T) samlidp.Response {
	tt.Helper()
	person := s.Person()
	acs := s.SPLogin(tt, person)
	res := s.CompleteSignup(tt, acs, s.VerificationCode(tt, person.Email))
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
	return person
}

// Enforce makes SAML the org's required login, which needs one SAML login first.
// Admin bypass stays on so the tenant's password-based admin can keep managing it.
func (s *SAML) Enforce(tt *testing.T) {
	tt.Helper()
	s.SignedUp(tt)
	Enforce(tt, s.Tenant)
}

func RefreshCookie(res *http.Response) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == "jid" {
			return c
		}
	}
	return nil
}

func VerificationCode(tt *testing.T, tn *harness.Tenant, email string) string {
	tt.Helper()
	msg := tn.Mail(tt).Expect(tt, email, smtp.Subject("confirmation code"))
	code, err := mail.Code(msg, 6)
	require.NoError(tt, err)
	return code
}

func siteRedirect(tt *testing.T, siteURL string, res *http.Response) *url.URL {
	tt.Helper()
	loc, err := url.Parse(res.Header.Get("Location"))
	require.NoError(tt, err)
	require.Equal(tt, siteURL, loc.Scheme+"://"+loc.Host)
	return loc
}

func signupClaims(tt *testing.T, loc *url.URL) map[string]any {
	tt.Helper()
	require.Equal(tt, "/signup/sso", loc.Path)
	parts := strings.Split(loc.Query().Get("token"), ".")
	require.Len(tt, parts, 3, "signup token is not a JWT")
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(tt, err)
	var claims map[string]any
	require.NoError(tt, json.Unmarshal(raw, &claims))
	return claims
}

// Session turns the refresh cookie an SSO login set into an org-scoped client, the way
// the select-organization page does.
func Session(tt *testing.T, tn *harness.Tenant, login *http.Response) *api.ClientWithResponses {
	tt.Helper()
	ctx := tt.Context()
	jid := RefreshCookie(login)
	require.NotNil(tt, jid, "the login set no refresh cookie")

	refreshed, err := tn.Anonymous(tt).RefreshAuthTokenWithResponse(ctx, func(_ context.Context, req *http.Request) error {
		req.AddCookie(jid)
		return nil
	})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, refreshed.StatusCode(), "refreshing the SSO session: %s", apierr.Body(refreshed.Body))

	selected, err := tn.Client(tt, refreshed.JSON200.Token).SelectOrganizationV3WithResponse(ctx,
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, selected.StatusCode(), "selecting the organization: %s", apierr.Body(selected.Body))
	return tn.Client(tt, selected.JSON200.Token)
}

// CompleteSignup finishes SSO signup from the login that sent the browser to the SSO
// signup page, with the code Infisical mailed.
func CompleteSignup(tt *testing.T, tn *harness.Tenant, login *http.Response, code string) *api.CompleteAccountSignupV3Response {
	tt.Helper()
	loc, err := url.Parse(login.Header.Get("Location"))
	require.NoError(tt, err)
	var union api.CompleteAccountSignupV3JSONBody
	require.NoError(tt, union.FromCompleteAccountSignupV3JSONBody1(api.CompleteAccountSignupV3JSONBody1{
		Type: api.CompleteAccountSignupV3JSONBody1Type("alias"),
		Code: code,
	}))
	raw, err := json.Marshal(union)
	require.NoError(tt, err)

	res, err := tn.Client(tt, loc.Query().Get("token")).CompleteAccountSignupV3WithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err)
	return res
}

// Enforce makes SSO the org's required login. Admin bypass stays on so the tenant's
// password-based admin can keep managing it.
func Enforce(tt *testing.T, tn *harness.Tenant) {
	tt.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(tt.Context(), tn.OrgID.String(), api.UpdateOrganizationJSONRequestBody{
		AuthEnforced:         new(true),
		BypassOrgAuthEnabled: new(true),
	})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "enforcing SSO: %s", apierr.Body(res.Body))
}
