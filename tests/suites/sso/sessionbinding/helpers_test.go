package sessionbinding_test

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// The org whose IdP logs alice in. Any other org she's in didn't issue her session.
type issuer struct {
	tn    *harness.Tenant
	email string
	login func(t *testing.T) *http.Response
}

func samlIssuer(t *testing.T) issuer {
	t.Helper()
	s := sso.NewSAML(t, harness.From(t).NewTenant(t), sso.Okta)
	alice := s.SignedUp(t)
	return issuer{tn: s.Tenant, email: alice.Email, login: func(t *testing.T) *http.Response {
		t.Helper()
		acs := s.SPLogin(t, alice)
		s.Redirect(t, acs)
		return acs.HTTPResponse
	}}
}

func oidcIssuer(t *testing.T) issuer {
	t.Helper()
	o := sso.NewOIDC(t, harness.From(t).NewTenant(t))
	alice := o.SignedUp(t)
	return issuer{tn: o.Tenant, email: alice.Email, login: func(t *testing.T) *http.Response {
		t.Helper()
		res := o.Login(t, alice)
		o.Redirect(t, res)
		return res.HTTPResponse
	}}
}

func (iss issuer) selectOrg(t *testing.T, login *http.Response, orgID uuid.UUID) *api.SelectOrganizationV3Response {
	t.Helper()
	return sso.SelectOrganization(t, iss.tn, login, orgID.String())
}

// Returns the response too, its jid cookie keeps the session going.
func (iss issuer) session(t *testing.T, login *http.Response, orgID uuid.UUID) (*api.ClientWithResponses, *http.Response) {
	t.Helper()
	res := iss.selectOrg(t, login, orgID)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting %s: %s", orgID, apierr.Body(res.Body))
	require.False(t, res.JSON200.IsMfaEnabled, "selecting the org asked for MFA")
	return iss.tn.Client(t, res.JSON200.Token), res.HTTPResponse
}

// alice signs in through iss and is also in other with role. other has its own SAML so
// it can turn on enforcement.
func setup(t *testing.T, role string) (issuer, *sso.SAML) {
	t.Helper()
	return setupWith(t, samlIssuer, role)
}

func setupWith(t *testing.T, newIssuer func(*testing.T) issuer, role string) (issuer, *sso.SAML) {
	t.Helper()
	iss := newIssuer(t)
	other := sso.NewSAML(t, harness.From(t).NewTenant(t), sso.Okta)
	join(t, other.Tenant.Admin.API, other.Tenant.OrgID, iss.email, role)
	return iss, other
}

// admin needs a session scoped to orgID.
func join(t *testing.T, admin *api.ClientWithResponses, orgID uuid.UUID, email, role string) {
	t.Helper()
	res, err := admin.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(email)},
		OrganizationId:       orgID.String(),
		OrganizationRoleSlug: &role,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "inviting %s: %s", email, apierr.Body(res.Body))
}

func readOrg(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
	t.Helper()
	res, err := c.GetOrganizationByIdWithResponse(t.Context(), orgID.String())
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func readProject(t *testing.T, c *api.ClientWithResponses, projectID string) (int, []byte) {
	t.Helper()
	res, err := c.GetProjectByIdWithResponse(t.Context(), projectID)
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func requireForeignSession(t *testing.T, status int, body []byte) {
	t.Helper()
	require.Equalf(t, http.StatusForbidden, status, "%s", apierr.Body(body))
	require.Contains(t, string(body), "another organization's identity provider")
}

// Audit logs go through a queue, so poll.
func waitForAuditEvent(t *testing.T, tn *harness.Tenant, eventType string, match func(map[string]any) bool) map[string]any {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (map[string]any, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: &eventType,
			StartDate: new(time.Now().UTC().Add(-time.Hour).Truncate(time.Second)),
		})
		if err != nil || res.JSON200 == nil {
			return nil, false, err
		}
		for _, l := range res.JSON200.AuditLogs {
			if m, ok := l.Event.Metadata.(map[string]any); ok && match(m) {
				return m, true, nil
			}
		}
		return nil, false, nil
	})
	require.NoErrorf(t, err, "waiting for a %s audit event", eventType)
	return got
}
