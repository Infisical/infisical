package machineidentity_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// uaIdentity is an org identity with universal auth whose credentials the test holds,
// so it can log in as often, and from wherever, the claim needs.
type uaIdentity struct {
	ID           uuid.UUID
	Name         string
	ClientID     string
	ClientSecret string
	SecretID     string
}

// createIdentity creates an org identity as the tenant admin and returns its id. Name and
// organization are filled in when the body leaves them empty.
func createIdentity(t *testing.T, tn *harness.Tenant, body api.CreateMachineIdentityJSONRequestBody) uuid.UUID {
	t.Helper()
	if body.Name == "" {
		body.Name = "i-" + id.Short()
	}
	body.OrganizationId = tn.OrgID.String()
	if body.Role == nil {
		body.Role = new("member")
	}
	res, err := tn.Admin.API.CreateMachineIdentityWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating identity %s returned %d: %s", body.Name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Identity.Id
}

// attachUA attaches universal auth as the tenant admin and returns the client id.
func attachUA(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, body api.AttachUniversalAuthJSONRequestBody) string {
	t.Helper()
	res, err := tn.Admin.API.AttachUniversalAuthWithResponse(t.Context(), identityID.String(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching universal auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.IdentityUniversalAuth.ClientId
}

// addClientSecret creates a client secret as the tenant admin and returns it with its id.
func addClientSecret(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, body api.CreateUniversalAuthClientSecretJSONRequestBody) (string, string) {
	t.Helper()
	res, err := tn.Admin.API.CreateUniversalAuthClientSecretWithResponse(t.Context(), identityID.String(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a client secret returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.ClientSecret, res.JSON200.ClientSecretData.Id
}

// newUA creates a member identity with universal auth configured by attach and one
// client secret.
func newUA(t *testing.T, tn *harness.Tenant, attach api.AttachUniversalAuthJSONRequestBody) *uaIdentity {
	t.Helper()
	name := "ua-" + id.Short()
	identityID := createIdentity(t, tn, api.CreateMachineIdentityJSONRequestBody{Name: name})
	clientID := attachUA(t, tn, identityID, attach)
	secret, secretID := addClientSecret(t, tn, identityID, api.CreateUniversalAuthClientSecretJSONRequestBody{})
	return &uaIdentity{ID: identityID, Name: name, ClientID: clientID, ClientSecret: secret, SecretID: secretID}
}

// uaLogin logs in through c, which decides the source address.
func uaLogin(t *testing.T, c *api.ClientWithResponses, clientID, secret, orgSlug string) *api.LoginWithUniversalAuthResponse {
	t.Helper()
	res, err := c.LoginWithUniversalAuthWithResponse(t.Context(), api.LoginWithUniversalAuthJSONRequestBody{
		ClientId:         clientID,
		ClientSecret:     secret,
		OrganizationSlug: &orgSlug,
	})
	require.NoError(t, err)
	return res
}

// login logs the identity into the tenant's organization and returns the access token.
func (u *uaIdentity) login(t *testing.T, tn *harness.Tenant) string {
	t.Helper()
	res := uaLogin(t, tn.Anonymous(t), u.ClientID, u.ClientSecret, tn.OrgSlug)
	require.NotNilf(t, res.JSON200, "logging in as %s returned %d: %s", u.Name, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.AccessToken
}

// whoami is the cheapest call an identity token can make, so it is what proves a token
// still authenticates. Every call counts against a token's use limit.
func whoami(t *testing.T, c *api.ClientWithResponses) (int, []byte) {
	t.Helper()
	res, err := c.GetMachineIdentityDetailsWithResponse(t.Context())
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func requireWorks(t *testing.T, c *api.ClientWithResponses) {
	t.Helper()
	status, body := whoami(t, c)
	requireStatus(t, http.StatusOK, status, body)
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

// waitForStatus polls a call until it answers with the wanted status. Permission and
// revocation changes can reach a token a few seconds late.
func waitForStatus(t *testing.T, want int, call func() (int, []byte)) []byte {
	t.Helper()
	var last []byte
	var lastStatus int
	_, err := wait.For(t.Context(), func(context.Context) (struct{}, bool, error) {
		lastStatus, last = call()
		return struct{}{}, lastStatus == want, nil
	})
	require.NoErrorf(t, err, "waiting for %d, last %d: %s", want, lastStatus, apierr.Body(last))
	return last
}

// sourceIP is a fresh address for a caller whose source address is what the test is
// about.
func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

type trustedIP = struct {
	IpAddress string `json:"ipAddress"`
}

func ips(addrs ...string) *[]trustedIP {
	out := make([]trustedIP, 0, len(addrs))
	for _, a := range addrs {
		out = append(out, trustedIP{IpAddress: a})
	}
	return &out
}

// storedIPs reads a trusted IP list as the API returns it: each entry is stored as an
// address plus prefix.
func storedIPs(v any) []string {
	entries, _ := v.([]any)
	out := []string{}
	for _, e := range entries {
		m, _ := e.(map[string]any)
		addr, _ := m["ipAddress"].(string)
		if prefix, ok := m["prefix"].(float64); ok {
			addr = fmt.Sprintf("%s/%d", addr, int(prefix))
		}
		out = append(out, addr)
	}
	return out
}

func getUA(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) *api.GetUniversalAuthResponse {
	t.Helper()
	res, err := tn.Admin.API.GetUniversalAuthWithResponse(t.Context(), identityID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading universal auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// claims decodes an access token's payload. The test holds the token, so reading what it
// carries is observing the response, not reaching into the server.
func claims(t *testing.T, token string) map[string]any {
	t.Helper()
	parts := strings.Split(token, ".")
	require.Len(t, parts, 3, "an access token is a JWT")
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	out := map[string]any{}
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

func jsonBody(t *testing.T, v any) io.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

// permanentRoles is a membership body's roles, sent as raw JSON because the generated
// item type is a union.
func permanentRoles(slugs ...string) map[string]any {
	roles := make([]map[string]any, 0, len(slugs))
	for _, s := range slugs {
		roles = append(roles, map[string]any{"role": s, "isTemporary": false})
	}
	return map[string]any{"roles": roles}
}

// identityNames lists the identities that hold a membership in an organization, as c
// sees them.
func identityNames(t *testing.T, c *api.ClientWithResponses, orgID string) []string {
	t.Helper()
	res, err := c.ListOrgIdentityMembershipsWithResponse(t.Context(), orgID, nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing identities returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, m := range res.JSON200.IdentityMemberships {
		names = append(names, m.Identity.Name)
	}
	return names
}

func getIdentity(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) *api.GetMachineIdentityByIdResponse {
	t.Helper()
	res, err := tn.Admin.API.GetMachineIdentityByIdWithResponse(t.Context(), identityID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading identity returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// linkIdentity gives a root identity a membership in a sub-organization, as the
// sub-organization's admin.
func linkIdentity(t *testing.T, subAdmin *harness.Principal, identityID uuid.UUID, role string) {
	t.Helper()
	res, err := subAdmin.API.CreateOrganizationIdentityMembershipWithBodyWithResponse(t.Context(),
		identityID.String(), "application/json", jsonBody(t, permanentRoles(role)))
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}
