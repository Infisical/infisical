package ldap_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/ldap"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// directory is a tenant's LDAP server, seeded with the tenant's own people.
type directory struct {
	*ldap.ControlPlane
	tn *harness.Tenant
}

func newDirectory(t *testing.T, tn *harness.Tenant) *directory {
	t.Helper()
	return &directory{ControlPlane: ldap.Open(t, fixture.FakenetAdmin(t, tn)), tn: tn}
}

// person adds someone who can bind, with a mail attribute, and returns their uid,
// password and email.
func (d *directory) person(t *testing.T, email string) (string, string, string) {
	t.Helper()
	uid := "u" + id.Short()
	password := "pw-" + id.Short()
	d.AddUser(t, uid, password, map[string][]string{
		"mail": {email}, "givenName": {"Ada"}, "sn": {"Lovelace"}, "uidNumber": {id.Short()},
	})
	return uid, password, email
}

func (d *directory) configBody() api.CreateLdapConfigJSONRequestBody {
	return api.CreateLdapConfigJSONRequestBody{
		OrganizationId: d.tn.OrgID.String(),
		IsActive:       true,
		Url:            ldap.Service.URL(),
		BindDN:         d.BindDN,
		BindPass:       d.BindPassword,
		SearchBase:     "ou=people," + d.BaseDN,
		SearchFilter:   new("(uid={{username}})"),
	}
}

func createConfig(t *testing.T, actor *api.ClientWithResponses, body api.CreateLdapConfigJSONRequestBody) *api.CreateLdapConfigResponse {
	t.Helper()
	res, err := actor.CreateLdapConfigWithResponse(t.Context(), body)
	require.NoError(t, err)
	return res
}

// configured gives the tenant a verified mail domain and an active LDAP config against
// its own directory.
func configured(t *testing.T, tn *harness.Tenant) *directory {
	t.Helper()
	fixture.VerifiedEmailDomain(t, tn)
	d := newDirectory(t, tn)
	res := createConfig(t, tn.Admin.API, d.configBody())
	require.Equalf(t, http.StatusOK, res.StatusCode(), "creating the LDAP config: %s", apierr.Body(res.Body))
	return d
}

func storedConfig(t *testing.T, tn *harness.Tenant) *api.GetLdapConfigResponse {
	t.Helper()
	res, err := tn.Admin.API.GetLdapConfigWithResponse(t.Context(), &api.GetLdapConfigParams{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	return res
}

// login posts the directory credentials the way the login form does. The credentials
// are read by the LDAP strategy before the route validates its body, so they are not
// in the generated request type.
func login(t *testing.T, tn *harness.Tenant, username, password string) *api.LoginWithLdapSsoResponse {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"organizationSlug": tn.OrgSlug, "username": username, "password": password})
	require.NoError(t, err)
	res, err := tn.Anonymous(t).LoginWithLdapSsoWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

// next is where a successful login sends the browser.
func next(t *testing.T, res *api.LoginWithLdapSsoResponse) *url.URL {
	t.Helper()
	require.Equalf(t, http.StatusOK, res.StatusCode(), "logging in: %s", apierr.Body(res.Body))
	var body struct {
		NextURL string `json:"nextUrl"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &body))
	u, err := url.Parse(body.NextURL)
	require.NoError(t, err)
	return u
}

// completeSignup finishes an SSO signup with the mailed code, as the signup page does.
func completeSignup(t *testing.T, tn *harness.Tenant, signupToken, code string) *api.CompleteAccountSignupV3Response {
	t.Helper()
	var union api.CompleteAccountSignupV3JSONBody
	require.NoError(t, union.FromCompleteAccountSignupV3JSONBody1(api.CompleteAccountSignupV3JSONBody1{
		Type: api.CompleteAccountSignupV3JSONBody1Type("alias"),
		Code: code,
	}))
	raw, err := json.Marshal(union)
	require.NoError(t, err)
	res, err := tn.Client(t, signupToken).CompleteAccountSignupV3WithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(t, err)
	return res
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}
