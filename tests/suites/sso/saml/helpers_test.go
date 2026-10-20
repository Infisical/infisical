package saml_test

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
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	okta   = api.CreateSamlConfigJSONBodyAuthProviderOktaSaml
	azure  = api.CreateSamlConfigJSONBodyAuthProviderAzureSaml
	google = api.CreateSamlConfigJSONBodyAuthProviderGoogleSaml
)

// sso is a tenant with SAML configured against its own IdP, and a browser to log in
// through it. The browser stops at redirects, because the redirect is the outcome.
type sso struct {
	tn       *harness.Tenant
	idp      *samlidp.IdP
	configID uuid.UUID
	issuer   string
	siteURL  string
	browser  *api.ClientWithResponses
}

func setup(t *testing.T, provider api.CreateSamlConfigJSONBodyAuthProvider) *sso {
	t.Helper()
	h := harness.From(t)
	tn := h.NewTenant(t)
	verifiedDomain(t, tn)
	idp := samlidp.New(t)
	body := configBody(tn, idp, provider)
	return &sso{
		tn:       tn,
		idp:      idp,
		configID: createConfig(t, tn, body),
		issuer:   body.Issuer,
		siteURL:  h.App().SiteURL(),
		browser:  tn.Anonymous(t, infisical.NoRedirects()),
	}
}

// verifiedDomain proves the tenant owns its mail domain, which every SAML login
// requires: the asserted email must sit on a domain the org has verified.
func verifiedDomain(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	ctx := t.Context()
	domain := strings.SplitN(tn.Email("x"), "@", 2)[1]

	created, err := tn.Admin.API.CreateEmailDomainWithResponse(ctx, api.CreateEmailDomainJSONRequestBody{Domain: domain})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, created.StatusCode(), "creating email domain: %s", apierr.Body(created.Body))
	record := created.JSON200.EmailDomain

	fakenet.SetTXT(t, fixture.FakenetAdmin(t, tn), record.VerificationRecordName,
		"infisical-domain-verification="+record.VerificationCode)

	verified, err := tn.Admin.API.VerifyEmailDomainWithResponse(ctx, record.Id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, verified.StatusCode(), "verifying email domain: %s", apierr.Body(verified.Body))
}

func createConfig(t *testing.T, tn *harness.Tenant, body api.CreateSamlConfigJSONRequestBody) uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.CreateSamlConfigWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating SAML config: %s", apierr.Body(res.Body))
	return res.JSON200.Id
}

func configBody(tn *harness.Tenant, idp *samlidp.IdP, provider api.CreateSamlConfigJSONBodyAuthProvider) api.CreateSamlConfigJSONRequestBody {
	return api.CreateSamlConfigJSONRequestBody{
		OrganizationId: tn.OrgID.String(),
		AuthProvider:   provider,
		IsActive:       true,
		EntryPoint:     idp.EntryPoint,
		Issuer:         "infisical-" + id.Short(),
		Cert:           idp.CertPEM(),
	}
}

// person is a user the IdP asserts, on the tenant's verified domain.
func (s *sso) person() samlidp.Response {
	return samlidp.Response{
		Email:     s.tn.Email("user-" + id.Short()),
		FirstName: "Ada",
		LastName:  "Lovelace",
	}
}

// startLogin begins an SP-initiated login the way the login page does.
func (s *sso) startLogin(t *testing.T, params *api.RedirectSamlByOrgSlugParams) samlidp.Request {
	t.Helper()
	res, err := s.browser.RedirectSamlByOrgSlugWithResponse(t.Context(), s.tn.OrgSlug, params)
	require.NoError(t, err)
	require.Equalf(t, http.StatusFound, res.StatusCode(), "starting SAML login: %s", apierr.Body(res.Body))
	return s.idp.ParseRedirect(t, res.HTTPResponse.Header.Get("Location"))
}

// spLogin runs an SP-initiated login end to end and returns the ACS answer. The
// response answers the request Infisical made unless r says otherwise.
func (s *sso) spLogin(t *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	t.Helper()
	return s.answer(t, s.startLogin(t, nil), r)
}

// answer posts the IdP's response to a request Infisical made.
func (s *sso) answer(t *testing.T, req samlidp.Request, r samlidp.Response) *api.SamlAcsResponse {
	t.Helper()
	r.Destination = req.ACSURL
	r.InResponseTo = req.ID
	r.RelayState = req.RelayState
	return s.post(t, r)
}

// idpLogin posts an unsolicited response, as an IdP tile in the user's dashboard does.
func (s *sso) idpLogin(t *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	t.Helper()
	r.Destination = s.siteURL + "/api/v1/sso/saml2/" + s.configID.String()
	return s.post(t, r)
}

func (s *sso) post(t *testing.T, r samlidp.Response) *api.SamlAcsResponse {
	t.Helper()
	if r.Audience == "" {
		r.Audience = s.siteURL
	}
	return s.acs(t, s.configID, s.idp.Respond(t, r))
}

func (s *sso) acs(t *testing.T, configID uuid.UUID, form url.Values) *api.SamlAcsResponse {
	t.Helper()
	body := api.SamlAcsFormdataRequestBody{SAMLResponse: new(form.Get("SAMLResponse"))}
	if relay := form.Get("RelayState"); relay != "" {
		body.RelayState = new(relay)
	}
	res, err := s.browser.SamlAcsWithFormdataBodyWithResponse(t.Context(), configID.String(), body)
	require.NoError(t, err)
	return res
}

// redirect is where the ACS sent the browser, relative to SITE_URL.
func (s *sso) redirect(t *testing.T, res *api.SamlAcsResponse) *url.URL {
	t.Helper()
	require.Equalf(t, http.StatusFound, res.StatusCode(), "ACS did not redirect: %s", apierr.Body(res.Body))
	loc, err := url.Parse(res.HTTPResponse.Header.Get("Location"))
	require.NoError(t, err)
	require.Equal(t, s.siteURL, loc.Scheme+"://"+loc.Host)
	return loc
}

// signupClaims decodes the signup token the ACS handed the SSO signup page.
func (s *sso) signupClaims(t *testing.T, res *api.SamlAcsResponse) map[string]any {
	t.Helper()
	loc := s.redirect(t, res)
	require.Equal(t, "/signup/sso", loc.Path)
	parts := strings.Split(loc.Query().Get("token"), ".")
	require.Len(t, parts, 3, "signup token is not a JWT")
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	var claims map[string]any
	require.NoError(t, json.Unmarshal(raw, &claims))
	return claims
}

func refreshCookie(res *api.SamlAcsResponse) *http.Cookie {
	for _, c := range res.HTTPResponse.Cookies() {
		if c.Name == "jid" {
			return c
		}
	}
	return nil
}

// session turns the refresh cookie from a SAML login into an org-scoped client, the
// way the select-organization page does.
func (s *sso) session(t *testing.T, res *api.SamlAcsResponse) *api.ClientWithResponses {
	t.Helper()
	ctx := t.Context()
	jid := refreshCookie(res)
	require.NotNil(t, jid, "the ACS set no refresh cookie")

	refreshed, err := s.tn.Anonymous(t).RefreshAuthTokenWithResponse(ctx, func(_ context.Context, req *http.Request) error {
		req.AddCookie(jid)
		return nil
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, refreshed.StatusCode(), "refreshing the SAML session: %s", apierr.Body(refreshed.Body))

	selected, err := s.tn.Client(t, refreshed.JSON200.Token).SelectOrganizationV3WithResponse(ctx,
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.tn.OrgID.String()})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, selected.StatusCode(), "selecting the organization: %s", apierr.Body(selected.Body))
	return s.tn.Client(t, selected.JSON200.Token)
}

// verificationCode is the code Infisical mails a user whose SAML account it has not
// verified yet.
func (s *sso) verificationCode(t *testing.T, email string) string {
	t.Helper()
	msg := s.tn.Mail(t).Expect(t, email, smtp.Subject("confirmation code"))
	code, err := mail.Code(msg, 6)
	require.NoError(t, err)
	return code
}

// completeSignup finishes SSO signup with the mailed code, as the SSO signup page
// does, and returns the response.
func (s *sso) completeSignup(t *testing.T, acs *api.SamlAcsResponse, code string) *api.CompleteAccountSignupV3Response {
	t.Helper()
	token := s.redirect(t, acs).Query().Get("token")

	var union api.CompleteAccountSignupV3JSONBody
	require.NoError(t, union.FromCompleteAccountSignupV3JSONBody1(api.CompleteAccountSignupV3JSONBody1{
		Type: api.CompleteAccountSignupV3JSONBody1Type("alias"),
		Code: code,
	}))
	raw, err := json.Marshal(union)
	require.NoError(t, err)

	res, err := s.tn.Client(t, token).CompleteAccountSignupV3WithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

// signedUp logs a new person in through SAML and completes their signup, leaving an
// accepted member with a verified SAML account.
func (s *sso) signedUp(t *testing.T) samlidp.Response {
	t.Helper()
	person := s.person()
	acs := s.spLogin(t, person)
	res := s.completeSignup(t, acs, s.verificationCode(t, person.Email))
	require.Equalf(t, http.StatusOK, res.StatusCode(), "completing SSO signup: %s", apierr.Body(res.Body))
	return person
}

type membership struct {
	id       uuid.UUID
	userID   uuid.UUID
	status   string
	isActive bool
}

// membershipOf is the org membership for an email, as the admin sees it, or nil when
// there is none.
func membershipOf(t *testing.T, tn *harness.Tenant, email string) *membership {
	t.Helper()
	res, err := tn.Admin.API.ListOrgMembershipsWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing memberships: %s", apierr.Body(res.Body))
	for _, m := range res.JSON200.Users {
		if m.User.Email != nil && strings.EqualFold(*m.User.Email, email) {
			out := &membership{id: m.Id, userID: m.User.Id}
			if m.Status != nil {
				out.status = *m.Status
			}
			if m.IsActive != nil {
				out.isActive = *m.IsActive
			}
			return out
		}
	}
	return nil
}

// enforce makes SAML the org's required login, which needs one SAML login first.
// Admin bypass stays on so the tenant's password-based admin can keep managing it.
func (s *sso) enforce(t *testing.T) {
	t.Helper()
	s.signedUp(t)
	res, err := s.tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), s.tn.OrgID.String(), api.UpdateOrganizationJSONRequestBody{
		AuthEnforced:         new(true),
		BypassOrgAuthEnabled: new(true),
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "enforcing SAML: %s", apierr.Body(res.Body))
}
