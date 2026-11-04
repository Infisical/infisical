package user_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/stretchr/testify/require"
)

// newIP is a source address no other caller uses: its own rate-limit bucket, and to
// Infisical a device it has not seen.
func newIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

// device is a browser on its own address with no credentials.
func device(t *testing.T, tn *harness.Tenant, ip string, opts ...api.ClientOption) *api.ClientWithResponses {
	t.Helper()
	return tn.Anonymous(t, append([]api.ClientOption{infisical.ForwardedFor(ip)}, opts...)...)
}

// as is a client carrying a token from a given address.
func as(t *testing.T, tn *harness.Tenant, token, ip string) *api.ClientWithResponses {
	t.Helper()
	return tn.Client(t, token, infisical.ForwardedFor(ip))
}

func withCookies(cookies ...*http.Cookie) api.RequestEditorFn {
	return func(_ context.Context, req *http.Request) error {
		for _, c := range cookies {
			if c != nil {
				req.AddCookie(c)
			}
		}
		return nil
	}
}

func cookieNamed(res *http.Response, name string) *http.Cookie {
	for _, c := range res.Cookies() {
		if c.Name == name {
			return c
		}
	}
	return nil
}

// session is one browser's login: the access token and the refresh cookie, from one
// address, so the server sees one session row for it.
type session struct {
	IP    string
	Token string
	JID   *http.Cookie
	API   *api.ClientWithResponses
}

// login is the password step of a login, from a fresh address.
func login(t *testing.T, tn *harness.Tenant, email, password string) (*api.LoginV3Response, string) {
	t.Helper()
	ip := newIP()
	res, err := device(t, tn, ip).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email:    email,
		Password: password,
	})
	require.NoError(t, err)
	return res, ip
}

// loggedIn logs in with the harness password and returns the org-less session.
func loggedIn(t *testing.T, tn *harness.Tenant, email string) session {
	t.Helper()
	res, ip := login(t, tn, email, harness.UserPassword)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "logging in as %s: %s", email, apierr.Body(res.Body))
	return session{
		IP:    ip,
		Token: res.JSON200.AccessToken,
		JID:   cookieNamed(res.HTTPResponse, "jid"),
		API:   as(t, tn, res.JSON200.AccessToken, ip),
	}
}

// selectOrg binds a session to an organization.
func selectOrg(t *testing.T, tn *harness.Tenant, s session, orgID string) *api.SelectOrganizationV3Response {
	t.Helper()
	res, err := s.API.SelectOrganizationV3WithResponse(t.Context(), api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgID})
	require.NoError(t, err)
	return res
}

// signIn is a full password login into the tenant's organization from a fresh address.
func signIn(t *testing.T, tn *harness.Tenant, email string) session {
	t.Helper()
	s := loggedIn(t, tn, email)
	res := selectOrg(t, tn, s, tn.OrgID.String())
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting the organization: %s", apierr.Body(res.Body))
	require.False(t, res.JSON200.IsMfaEnabled, "the login asked for MFA")
	return session{
		IP:    s.IP,
		Token: res.JSON200.Token,
		JID:   cookieNamed(res.HTTPResponse, "jid"),
		API:   as(t, tn, res.JSON200.Token, s.IP),
	}
}

// orgStatus is the status of a read every member may make.
func orgStatus(t *testing.T, c *api.ClientWithResponses, orgID string) int {
	t.Helper()
	res, err := c.GetOrganizationByIdWithResponse(t.Context(), orgID)
	require.NoError(t, err)
	return res.StatusCode()
}

func meStatus(t *testing.T, c *api.ClientWithResponses) int {
	t.Helper()
	res, err := c.GetCurrentUserWithResponse(t.Context())
	require.NoError(t, err)
	return res.StatusCode()
}

// refresh exchanges a refresh cookie for an access token.
func refresh(t *testing.T, tn *harness.Tenant, ip string, jid *http.Cookie) *api.RefreshAuthTokenResponse {
	t.Helper()
	res, err := device(t, tn, ip).RefreshAuthTokenWithResponse(t.Context(), withCookies(jid))
	require.NoError(t, err)
	return res
}

func code(t *testing.T, msg smtp.Message) string {
	t.Helper()
	c, err := mail.Code(msg, 6)
	require.NoError(t, err)
	return c
}

func otherCode(c string) string {
	if c == "000000" {
		return "111111"
	}
	return "000000"
}

// postJSON marshals a union body, which the typed request body cannot carry.
func postJSON(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

func updateOrg(t *testing.T, tn *harness.Tenant, body api.UpdateOrganizationJSONRequestBody) *api.UpdateOrganizationResponse {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(), body)
	require.NoError(t, err)
	return res
}
