package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

type mapping = struct {
	GroupName string `json:"groupName"`
	RoleSlug  string `json:"roleSlug"`
}

func mappingsBody(pairs ...string) api.UpdateExternalGroupOrgRoleMappingsJSONRequestBody {
	body := api.UpdateExternalGroupOrgRoleMappingsJSONRequestBody{Mappings: []mapping{}}
	for i := 0; i+1 < len(pairs); i += 2 {
		body.Mappings = append(body.Mappings, mapping{GroupName: pairs[i], RoleSlug: pairs[i+1]})
	}
	return body
}

func setMappings(t *testing.T, client *api.ClientWithResponses, pairs ...string) *api.UpdateExternalGroupOrgRoleMappingsResponse {
	t.Helper()
	res, err := client.UpdateExternalGroupOrgRoleMappingsWithResponse(t.Context(), mappingsBody(pairs...))
	require.NoError(t, err)
	return res
}

// currentMappings is the tenant's mapping set as group name to role.
func currentMappings(t *testing.T, tn *harness.Tenant) map[string]string {
	t.Helper()
	res, err := tn.Admin.API.ListExternalGroupOrgRoleMappingsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing mappings returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := map[string]string{}
	for _, m := range *res.JSON200 {
		out[m.GroupName] = m.Role
	}
	return out
}

func TestGroup_ExternalMapping(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a group name mapped twice and keep the old mapping set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		requireStatus(t, http.StatusOK, setMappings(t, tn.Admin.API, "engineering", "member").StatusCode(), nil)

		// Action
		res := setMappings(t, tn.Admin.API, "platform", "admin", "platform", "member")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group 'platform' is mapped more than once")
		require.Equal(t, map[string]string{"engineering": "member"}, currentMappings(t, tn))
	})

	t.Run("should refuse mapping to a custom role when the plan lacks rbac", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "auditor", fixture.Permission{Subject: "audit-logs", Action: []string{"read"}})
		tn.SetPlan(t, license.Enterprise().Without(license.RBAC))

		// Action
		res := setMappings(t, tn.Admin.API, "auditors", "auditor")

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to set group organization role mapping due to plan RBAC restriction")
		require.Empty(t, currentMappings(t, tn))
	})

	t.Run("should refuse a member without scim edit and keep the mapping set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		// Action
		res := setMappings(t, member.API, "engineering", "member")

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to edit on scim")
		require.Empty(t, currentMappings(t, tn))
	})

	t.Run("should refuse the mapping from a sub-org token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)

		// Action
		res := setMappings(t, sub.Admin.API, "engineering", "member")

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Child organization cannot do this operation")
		require.Empty(t, currentMappings(t, tn))
	})

	t.Run("should put an OIDC user in the group their groups claim names and give them its org role", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `External group to org role mappings are applied by SCIM only. On OIDC login a
			groups claim drives Infisical group membership (manageGroupMemberships), and the
			org role comes from the group.`)

		// Setup
		tn := h.NewTenant(t)
		oidc := oidcManagedGroups(t, tn)
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))
		person := oidc.Person()
		person.Groups = []string{group.Name}

		// Action
		login := oidc.Login(t, person)

		// Assert
		require.Equal(t, []string{person.Email}, groupUsernames(t, tn, group.ID))
		signup := oidc.CompleteSignup(t, login, sso.VerificationCode(t, tn, person.Email))
		require.NotNilf(t, signup.JSON200, "completing the OIDC signup returned %d: %s", signup.StatusCode(), apierr.Body(signup.Body))
		selected, err := tn.Client(t, signup.JSON200.Token).SelectOrganizationV3WithResponse(t.Context(),
			api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()})
		require.NoError(t, err)
		require.NotNilf(t, selected.JSON200, "selecting the organization returned %d: %s", selected.StatusCode(), apierr.Body(selected.Body))
		status, body := readConnections(t, tn.Client(t, selected.JSON200.Token))
		requireStatus(t, http.StatusOK, status, body)
	})
}
