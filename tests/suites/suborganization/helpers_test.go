package suborganization_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

// waitForStatus polls a call until it answers with the wanted status. Membership and
// role changes reach the project permission cache up to 10 seconds late.
func waitForStatus(t *testing.T, want int, call func() (int, []byte)) []byte {
	t.Helper()
	var last []byte
	_, err := wait.For(t.Context(), func(context.Context) (struct{}, bool, error) {
		status, body := call()
		last = body
		return struct{}{}, status == want, nil
	})
	require.NoErrorf(t, err, "waiting for %d, last body: %s", want, apierr.Body(last))
	return last
}

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

// sourceIP is a fresh rate-limit bucket, for calls that go through smtpRateLimit.
func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

func permanent(slug string) map[string]any { return map[string]any{"role": slug, "isTemporary": false} }

// expired is a temporary role whose window closed an hour ago.
func expired(slug string) map[string]any {
	return map[string]any{
		"role":                     slug,
		"isTemporary":              true,
		"temporaryMode":            "relative",
		"temporaryRange":           "1h",
		"temporaryAccessStartTime": time.Now().Add(-2 * time.Hour).UTC().Format(time.RFC3339),
	}
}

// link asks the client's organization to link a group with these roles.
func link(t *testing.T, client *api.ClientWithResponses, groupID uuid.UUID, roles ...map[string]any) *api.CreateOrganizationGroupMembershipResponse {
	t.Helper()
	res, err := client.CreateOrganizationGroupMembershipWithBodyWithResponse(t.Context(), groupID,
		"application/json", jsonBody(t, map[string]any{"roles": roles}))
	require.NoError(t, err)
	return res
}

// addToSubOrg invites a root member into the sub-org with an org role, as its admin.
func addToSubOrg(t *testing.T, sub *fixture.SubOrg, user *harness.Principal, role string) {
	t.Helper()
	admin := sub.Tenant().Client(t, sub.Admin.Token, infisical.ForwardedFor(sourceIP()))
	res, err := admin.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(user.Email)},
		OrganizationId:       sub.ID.String(),
		OrganizationRoleSlug: &role,
	})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "adding %s to %s: %s", user.Email, sub.Slug, apierr.Body(res.Body))
}

// memberUserIDs lists the users holding a direct membership in an organization.
func memberUserIDs(t *testing.T, client *api.ClientWithResponses, orgID uuid.UUID) []uuid.UUID {
	t.Helper()
	res, err := client.ListOrgMembershipsWithResponse(t.Context(), orgID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the members of %s returned %d: %s", orgID, res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, m := range res.JSON200.Users {
		out = append(out, m.User.Id)
	}
	return out
}

func memberRole(t *testing.T, client *api.ClientWithResponses, orgID, userID uuid.UUID) string {
	t.Helper()
	res, err := client.ListOrgMembershipsWithResponse(t.Context(), orgID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the members of %s returned %d: %s", orgID, res.StatusCode(), apierr.Body(res.Body))
	for _, m := range res.JSON200.Users {
		if m.User.Id == userID {
			return m.Role
		}
	}
	t.Fatalf("user %s has no membership in %s", userID, orgID)
	return ""
}

func subOrgNames(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListSubOrganizationsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing sub-organizations returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []string{}
	for _, o := range res.JSON200.Organizations {
		out = append(out, o.Name)
	}
	return out
}

// groupIDs lists the groups that hold a membership in the client's organization.
func groupIDs(t *testing.T, client *api.ClientWithResponses) []uuid.UUID {
	t.Helper()
	res, err := client.ListGroupsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing groups returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, g := range *res.JSON200 {
		out = append(out, g.Id)
	}
	return out
}

func groupRoleIn(t *testing.T, client *api.ClientWithResponses, groupID uuid.UUID) string {
	t.Helper()
	res, err := client.GetGroupByIdWithResponse(t.Context(), groupID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading group %s returned %d: %s", groupID, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Role
}

func projectGroupIDs(t *testing.T, client *api.ClientWithResponses, projectID string) []uuid.UUID {
	t.Helper()
	res, err := client.ListProjectGroupMembershipsWithResponse(t.Context(), projectID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the groups of %s returned %d: %s", projectID, res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, m := range res.JSON200.GroupMemberships {
		out = append(out, m.GroupId)
	}
	return out
}

func listSecrets(t *testing.T, client *api.ClientWithResponses, projectID string) (int, []byte) {
	t.Helper()
	env, path := "dev", "/"
	res, err := client.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:   &projectID,
		Environment: &env,
		SecretPath:  &path,
	})
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

// readConnections lists AWS app connections, which needs read on app-connections at
// the org level: admin has it, member does not.
func readConnections(t *testing.T, client *api.ClientWithResponses) (int, []byte) {
	t.Helper()
	res, err := client.ListAwsAppConnectionsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

// passwordLogin logs a harness user in again and returns the session's token, which
// is not yet bound to any organization.
func passwordLogin(t *testing.T, tn *harness.Tenant, email string) string {
	t.Helper()
	res, err := tn.Anonymous(t, infisical.ForwardedFor(sourceIP())).LoginV3WithResponse(t.Context(), api.LoginV3JSONRequestBody{
		Email:    email,
		Password: harness.UserPassword,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "logging in as %s returned %d: %s", email, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.AccessToken
}

func selectOrg(t *testing.T, tn *harness.Tenant, token string, orgID uuid.UUID) *api.SelectOrganizationV3Response {
	t.Helper()
	res, err := tn.Client(t, token).SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: orgID.String()})
	require.NoError(t, err)
	return res
}

// universalAuth is a root org machine identity's universal auth credentials.
type universalAuth struct {
	IdentityID   uuid.UUID
	ClientID     string
	ClientSecret string
}

func newUniversalAuth(t *testing.T, tn *harness.Tenant) universalAuth {
	t.Helper()
	ctx, admin := t.Context(), tn.Admin.API
	created, err := admin.CreateMachineIdentityWithResponse(ctx, api.CreateMachineIdentityJSONRequestBody{
		Name: "i-" + id.Short(), OrganizationId: tn.OrgID.String(), Role: new("no-access"),
	})
	require.NoError(t, err)
	require.NotNilf(t, created.JSON200, "creating an identity returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
	identityID := created.JSON200.Identity.Id

	attached, err := admin.AttachUniversalAuthWithResponse(ctx, identityID.String(), api.AttachUniversalAuthJSONRequestBody{})
	require.NoError(t, err)
	require.NotNilf(t, attached.JSON200, "attaching universal auth returned %d: %s", attached.StatusCode(), apierr.Body(attached.Body))
	secret, err := admin.CreateUniversalAuthClientSecretWithResponse(ctx, identityID.String(),
		api.CreateUniversalAuthClientSecretJSONRequestBody{})
	require.NoError(t, err)
	require.NotNilf(t, secret.JSON200, "creating a client secret returned %d: %s", secret.StatusCode(), apierr.Body(secret.Body))

	return universalAuth{IdentityID: identityID, ClientID: attached.JSON200.IdentityUniversalAuth.ClientId, ClientSecret: secret.JSON200.ClientSecret}
}

func (u universalAuth) login(t *testing.T, tn *harness.Tenant, orgSlug string) *api.LoginWithUniversalAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t, infisical.ForwardedFor(sourceIP())).LoginWithUniversalAuthWithResponse(t.Context(),
		api.LoginWithUniversalAuthJSONRequestBody{ClientId: u.ClientID, ClientSecret: u.ClientSecret, OrganizationSlug: &orgSlug})
	require.NoError(t, err)
	return res
}

// auditEvent waits for an organization's audit log to hold an event of the type whose
// metadata passes match. Audit logs are written from a queue after the response.
func auditEvent(t *testing.T, client *api.ClientWithResponses, eventType string, match func(map[string]any) bool) map[string]any {
	t.Helper()
	since := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	found, err := wait.For(t.Context(), func(ctx context.Context) (map[string]any, bool, error) {
		res, err := client.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
			EventType: &eventType,
			StartDate: &since,
		})
		if err != nil {
			return nil, false, err
		}
		if res.JSON200 == nil {
			return nil, false, fmt.Errorf("listing audit logs returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		}
		for _, l := range res.JSON200.AuditLogs {
			metadata, _ := l.Event.Metadata.(map[string]any)
			if match(metadata) {
				return metadata, true, nil
			}
		}
		return nil, false, nil
	})
	require.NoErrorf(t, err, "waiting for a %s audit event", eventType)
	return found
}
