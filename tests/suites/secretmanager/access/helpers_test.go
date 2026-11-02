package access_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// roleEntry is one role of a membership update. The generated bodies declare roles as
// a union, so updates go out as raw JSON.
type roleEntry struct {
	Role                     string `json:"role"`
	IsTemporary              bool   `json:"isTemporary"`
	TemporaryMode            string `json:"temporaryMode,omitempty"`
	TemporaryRange           string `json:"temporaryRange,omitempty"`
	TemporaryAccessStartTime string `json:"temporaryAccessStartTime,omitempty"`
}

func permanent(slug string) roleEntry { return roleEntry{Role: slug} }

func temporary(slug string, start time.Time, length string) roleEntry {
	return roleEntry{
		Role:                     slug,
		IsTemporary:              true,
		TemporaryMode:            "relative",
		TemporaryRange:           length,
		TemporaryAccessStartTime: start.UTC().Format(time.RFC3339),
	}
}

func rolesBody(t *testing.T, roles []roleEntry) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(map[string]any{"roles": roles})
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

// grantedRole is a role as a membership listing reports it, with a custom role's slug
// in place of "custom".
type grantedRole struct {
	Slug      string
	Temporary bool
	EndsAt    *time.Time
}

func roleSlug(role string, custom *string) string {
	if role == "custom" && custom != nil {
		return *custom
	}
	return role
}

func setIdentityRoles(t *testing.T, proj *fixture.Project, identity *harness.Principal, roles ...roleEntry) *api.UpdateProjectIdentityMembershipResponse {
	t.Helper()
	res, err := proj.Tenant().Admin.API.UpdateProjectIdentityMembershipWithBodyWithResponse(t.Context(), proj.ID,
		identity.ID.String(), "application/json", rolesBody(t, roles))
	require.NoError(t, err)
	return res
}

func identityRoles(t *testing.T, proj *fixture.Project, identity *harness.Principal) []grantedRole {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListProjectIdentityMembershipsWithResponse(t.Context(), proj.ID, nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing identity memberships returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, m := range res.JSON200.IdentityMemberships {
		if m.IdentityId != identity.ID.String() {
			continue
		}
		roles := make([]grantedRole, 0, len(m.Roles))
		for _, r := range m.Roles {
			roles = append(roles, grantedRole{Slug: roleSlug(r.Role, r.CustomRoleSlug), Temporary: r.IsTemporary, EndsAt: r.TemporaryAccessEndTime})
		}
		return roles
	}
	t.Fatalf("identity %s has no membership in %s", identity.Name, proj.Slug)
	return nil
}

func setUserRoles(t *testing.T, proj *fixture.Project, actor, user *harness.Principal, roles ...roleEntry) *api.UpdateProjectMembershipResponse {
	t.Helper()
	res, err := actor.API.UpdateProjectMembershipWithBodyWithResponse(t.Context(), proj.ID,
		membershipID(t, proj, user), "application/json", rolesBody(t, roles))
	require.NoError(t, err)
	return res
}

func userRoles(t *testing.T, proj *fixture.Project, user *harness.Principal) []grantedRole {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListProjectMembershipsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing memberships returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, m := range res.JSON200.Memberships {
		if m.UserId != user.ID {
			continue
		}
		roles := make([]grantedRole, 0, len(m.Roles))
		for _, r := range m.Roles {
			roles = append(roles, grantedRole{Slug: roleSlug(r.Role, r.CustomRoleSlug), Temporary: r.IsTemporary, EndsAt: r.TemporaryAccessEndTime})
		}
		return roles
	}
	return nil
}

func membershipID(t *testing.T, proj *fixture.Project, user *harness.Principal) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListProjectMembershipsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing memberships returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, m := range res.JSON200.Memberships {
		if m.UserId == user.ID {
			return m.Id.String()
		}
	}
	t.Fatalf("user %s has no membership in %s", user.Email, proj.Slug)
	return ""
}

func slugs(roles []grantedRole) []string {
	out := make([]string, 0, len(roles))
	for _, r := range roles {
		out = append(out, r.Slug)
	}
	return out
}

func createSecret(t *testing.T, actor *api.ClientWithResponses, proj *fixture.Project, env, secretPath, name, value string, editors ...api.RequestEditorFn) *api.CreateSecretV4Response {
	t.Helper()
	res, err := actor.CreateSecretV4WithResponse(t.Context(), name, api.CreateSecretV4JSONRequestBody{
		ProjectId:   proj.ID,
		Environment: env,
		SecretPath:  &secretPath,
		SecretValue: value,
	}, editors...)
	require.NoError(t, err)
	return res
}

func listSecrets(t *testing.T, actor *api.ClientWithResponses, proj *fixture.Project, env, secretPath string, editors ...api.RequestEditorFn) *api.ListSecretsV4Response {
	t.Helper()
	res, err := actor.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
		ProjectId:       &proj.ID,
		Environment:     &env,
		SecretPath:      &secretPath,
		ViewSecretValue: new(api.ListSecretsV4ParamsViewSecretValueTrue),
	}, editors...)
	require.NoError(t, err)
	return res
}

func keysOf(res *api.ListSecretsV4Response) []string {
	keys := []string{}
	if res.JSON200 == nil {
		return keys
	}
	for _, s := range res.JSON200.Secrets {
		keys = append(keys, s.SecretKey)
	}
	return keys
}

// waitForStatus polls a call until it answers with the wanted status. Membership and
// role changes reach the permission cache up to 10 seconds late.
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

// auditEvent waits for the tenant's audit log to hold an event of the type whose
// metadata passes match. Audit logs are written from a queue after the response.
func auditEvent(t *testing.T, tn *harness.Tenant, eventType string, match func(map[string]any) bool) map[string]any {
	t.Helper()
	since := time.Now().UTC().Add(-time.Hour).Truncate(time.Second)
	found, err := wait.For(t.Context(), func(ctx context.Context) (map[string]any, bool, error) {
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(ctx, &api.ListOrganizationAuditLogsParams{
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

// sourceIP is a fresh address for a caller whose source address is what the test is
// about.
func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}
