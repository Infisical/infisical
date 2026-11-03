package group_test

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
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/mail"
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

func rolesBody(t *testing.T, roles ...map[string]any) *bytes.Reader {
	t.Helper()
	return jsonBody(t, map[string]any{"roles": roles})
}

// readConnections lists AWS app connections, which needs read on app-connections at
// the org level: admin has it, member does not.
func readConnections(t *testing.T, client *api.ClientWithResponses) (int, []byte) {
	t.Helper()
	res, err := client.ListAwsAppConnectionsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	return res.StatusCode(), res.Body
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

func createSecret(t *testing.T, client *api.ClientWithResponses, projectID, name string) (int, []byte) {
	t.Helper()
	path := "/"
	res, err := client.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   projectID,
		Environment: "dev",
		SecretPath:  &path,
		SecretValue: "value",
	})
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

func groupRole(t *testing.T, tn *harness.Tenant, groupID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.GetGroupByIdWithResponse(t.Context(), groupID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading group %s returned %d: %s", groupID, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Role
}

func groupNames(t *testing.T, client *api.ClientWithResponses) []string {
	t.Helper()
	res, err := client.ListGroupsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing groups returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	names := []string{}
	for _, g := range *res.JSON200 {
		names = append(names, g.Name)
	}
	return names
}

func groupIdentityIDs(t *testing.T, tn *harness.Tenant, groupID uuid.UUID) []uuid.UUID {
	t.Helper()
	filter := api.AssignedMachineIdentities
	res, err := tn.Admin.API.ListGroupMachineIdentitiesWithResponse(t.Context(), groupID.String(),
		&api.ListGroupMachineIdentitiesParams{Filter: &filter})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the identities of group %s returned %d: %s", groupID, res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, i := range res.JSON200.MachineIdentities {
		out = append(out, i.Id)
	}
	return out
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

// invite asks the tenant's admin to invite an address, and leaves the invitation
// unaccepted.
func invite(t *testing.T, tn *harness.Tenant, local string) string {
	t.Helper()
	addr := tn.Email(local)
	admin := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
	res, err := admin.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:  []openapi_types.Email{openapi_types.Email(addr)},
		OrganizationId: tn.OrgID.String(),
	})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return addr
}

// accept takes an invitation the way the invitee does: the mailed link, account
// completion and organization selection. It returns their org-scoped client.
func accept(t *testing.T, tn *harness.Tenant, addr string) *api.ClientWithResponses {
	t.Helper()
	ctx := t.Context()
	msg := tn.Mail(t).Expect(t, addr, smtp.Subject("invitation"))
	code, err := mail.Param(msg, "token")
	require.NoError(t, err)

	verified, err := tn.Anonymous(t).VerifyUserToOrganizationWithResponse(ctx, api.VerifyUserToOrganizationJSONRequestBody{
		Email:          openapi_types.Email(addr),
		OrganizationId: tn.OrgID.String(),
		Code:           code,
	})
	require.NoError(t, err)
	require.Truef(t, verified.JSON200 != nil && verified.JSON200.Token != nil,
		"verifying the invitation returned %d: %s", verified.StatusCode(), apierr.Body(verified.Body))

	var union api.CompleteAccountSignupV3JSONBody
	require.NoError(t, union.FromCompleteAccountSignupV3JSONBody0(api.CompleteAccountSignupV3JSONBody0{
		Type:      api.CompleteAccountSignupV3JSONBody0TypeEmail,
		Email:     addr,
		FirstName: "invitee",
		Password:  harness.UserPassword,
	}))
	completed, err := tn.Client(t, *verified.JSON200.Token).CompleteAccountSignupV3WithBodyWithResponse(ctx,
		"application/json", jsonBody(t, union))
	require.NoError(t, err)
	require.NotNilf(t, completed.JSON200, "completing the account returned %d: %s", completed.StatusCode(), apierr.Body(completed.Body))

	selected, err := tn.Client(t, completed.JSON200.Token).SelectOrganizationV3WithResponse(ctx,
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()})
	require.NoError(t, err)
	require.NotNilf(t, selected.JSON200, "selecting the organization returned %d: %s", selected.StatusCode(), apierr.Body(selected.Body))
	return tn.Client(t, selected.JSON200.Token)
}

func groupUsernames(t *testing.T, tn *harness.Tenant, groupID uuid.UUID) []string {
	t.Helper()
	filter := api.ListGroupUsersParamsFilterExistingMembers
	res, err := tn.Admin.API.ListGroupUsersWithResponse(t.Context(), groupID.String(), &api.ListGroupUsersParams{Filter: &filter})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the users of group %s returned %d: %s", groupID, res.StatusCode(), apierr.Body(res.Body))
	out := []string{}
	for _, u := range res.JSON200.Users {
		out = append(out, u.Username)
	}
	return out
}
