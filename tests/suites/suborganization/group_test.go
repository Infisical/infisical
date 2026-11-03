package suborganization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func identityPrincipal(ua universalAuth) *harness.Principal {
	return &harness.Principal{Kind: harness.MachineIdentity, ID: ua.IdentityID, Name: ua.IdentityID.String()}
}

// scopedMember is a root user who also holds a direct sub-org membership with a role,
// with a session selected into the sub-org.
func scopedMember(t *testing.T, sub *fixture.SubOrg, rootRole, subRole string) *harness.Principal {
	t.Helper()
	user := sub.Tenant().NewUser(t, harness.OrgRole(rootRole))
	addToSubOrg(t, sub, user, subRole)
	return sub.Scope(t, user)
}

func availableGroupIDs(t *testing.T, client *api.ClientWithResponses) []uuid.UUID {
	t.Helper()
	res, err := client.ListAvailableOrganizationGroupsWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing available groups returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, g := range res.JSON200.Groups {
		out = append(out, g.Id)
	}
	return out
}

func TestSubOrgGroup_Native(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a sub-org create its own group with a name a root group already uses", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		rootGroup := fixture.NewGroup(t, tn)

		// Action
		res, err := sub.Admin.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: rootGroup.Name})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "answered %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, sub.ID, res.JSON200.OrgId)
		require.Equal(t, []uuid.UUID{res.JSON200.Id}, groupIDs(t, sub.Admin.API))
		require.Equal(t, []uuid.UUID{rootGroup.ID}, groupIDs(t, tn.Admin.API))
	})

	t.Run("should refuse adding a user to a native sub-org group when they are not a sub-org member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		rootOnly := tn.NewUser(t)
		groupID := sub.NewGroup(t, "native")

		// Action
		res, err := sub.Admin.API.AddUserToGroupWithResponse(t.Context(), groupID.String(), rootOnly.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "User with id "+rootOnly.ID.String()+" is not part of the organization")
		require.Empty(t, fixture.GroupUserIDs(t, sub.Admin.API, groupID))
	})
}

func TestSubOrgGroup_Link(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a linked root group's members select the sub-org with no direct membership", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)

		// Action
		res := link(t, sub.Admin.API, group.ID, permanent("member"))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		scoped := sub.Scope(t, member)
		require.Contains(t, groupIDs(t, scoped.API), group.ID)
		require.NotContains(t, memberUserIDs(t, sub.Admin.API, sub.ID), member.ID)
	})

	t.Run("should let a linked root group's identity log into the sub-org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		ua := newUniversalAuth(t, tn)
		group := fixture.NewGroup(t, tn)
		group.AddIdentity(t, identityPrincipal(ua))
		sub.LinkGroup(t, group, "member")

		// Action
		res := ua.login(t, tn, sub.Slug)

		// Assert
		require.NotNilf(t, res.JSON200, "answered %d: %s", res.StatusCode(), res.Body)
		require.Contains(t, groupIDs(t, tn.Client(t, res.JSON200.AccessToken)), group.ID)
	})

	t.Run("should refuse linking from the root org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res := link(t, tn.Admin.API, group.ID, permanent("member"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Organization membership cannot be created for groups in root organization")
	})

	t.Run("should refuse linking without link-group on the root and link nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		actor := scopedMember(t, sub, "member", "admin")
		group := fixture.NewGroup(t, tn)

		// Action
		res := link(t, actor.API, group.ID, permanent("member"))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to link-group on sub-organization")
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
	})

	t.Run("should refuse linking without groups create in the sub-org and link nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		actor := scopedMember(t, sub, "admin", "member")
		group := fixture.NewGroup(t, tn)

		// Action
		res := link(t, actor.API, group.ID, permanent("member"))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to create on groups")
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
	})

	t.Run("should answer 404 when linking a sibling sub-org's group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		mine, sibling := fixture.NewSubOrg(t, tn), fixture.NewSubOrg(t, tn)
		siblingGroup := sibling.NewGroup(t, "sibling")

		// Action
		res := link(t, mine.Admin.API, siblingGroup, permanent("member"))

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group with ID '"+siblingGroup.String()+"' not found")
		require.Empty(t, groupIDs(t, mine.Admin.API))
	})

	t.Run("should answer 404 when linking another root's group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, other := h.NewTenant(t), h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		foreign := fixture.NewGroup(t, other)

		// Action
		res := link(t, sub.Admin.API, foreign.ID, permanent("member"))

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group with ID '"+foreign.ID.String()+"' not found")
		require.Empty(t, groupIDs(t, sub.Admin.API))
	})

	t.Run("should refuse linking the sub-org's own group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		own := sub.NewGroup(t, "own")

		// Action
		res := link(t, sub.Admin.API, own, permanent("member"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group 'own' belongs to this organization. Only groups from the parent organization can be linked to it.")
		require.Equal(t, []uuid.UUID{own}, groupIDs(t, sub.Admin.API))
	})

	t.Run("should refuse linking the same group twice and keep its first role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res := link(t, sub.Admin.API, group.ID, permanent("admin"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group is already a member")
		require.Equal(t, "member", groupRoleIn(t, sub.Admin.API, group.ID))
	})

	t.Run("should refuse a link with only temporary roles and link nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)

		// Action
		res := link(t, sub.Admin.API, group.ID, expired("admin"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group must have at least one permanent role")
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
	})

	t.Run("should keep access from the permanent link role after a temporary one expires", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)

		// Action
		res := link(t, sub.Admin.API, group.ID, permanent("member"), expired("admin"))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		scoped := sub.Scope(t, member)
		require.Contains(t, groupIDs(t, scoped.API), group.ID)
		status, body := readConnections(t, scoped.API)
		requireStatus(t, http.StatusForbidden, status, body)
	})

	t.Run("should refuse a link role without grant-privileges on groups in the sub-org", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Under the new privilege system a link role is bounded by grant-privileges on
			groups, not by comparing it with the actor's own role.`)

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		role, err := sub.Admin.API.CreateOrganizationRoleWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{
			"slug": "group-linker", "name": "group-linker",
			"permissions": []fixture.Permission{{Subject: "groups", Action: []string{"read", "create"}}},
		}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, role.StatusCode(), role.Body)
		actor := scopedMember(t, sub, "admin", "group-linker")
		group := fixture.NewGroup(t, tn)

		// Action
		res := link(t, actor.API, group.ID, permanent("admin"))

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to link group to sub-organization. Permission denied: grant-privileges on groups")
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
	})
}

func TestSubOrgGroup_Linked(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse managing a linked root group's members from the sub-org, naming the parent", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), tn.Admin.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group '"+group.Slug+"' is owned by a parent organization. Its members must be managed from that organization.")
		require.Empty(t, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse removing a linked root group's user from the sub-org, and keep them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, tn.Admin)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.RemoveUserFromGroupWithResponse(t.Context(), group.ID.String(), tn.Admin.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "is owned by a parent organization")
		require.Equal(t, []uuid.UUID{tn.Admin.ID}, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse adding a machine identity to a linked root group from the sub-org, and add nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.AddMachineIdentityToGroupWithResponse(t.Context(), group.ID.String(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "is owned by a parent organization")
		require.Empty(t, groupIdentityIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse removing a machine identity from a linked root group from the sub-org, and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		group.AddIdentity(t, identity)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.RemoveMachineIdentityFromGroupWithResponse(t.Context(), group.ID.String(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "is owned by a parent organization")
		require.Equal(t, []uuid.UUID{identity.ID}, groupIdentityIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse renaming a linked group from the sub-org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.UpdateGroupWithResponse(t.Context(), group.ID.String(), api.UpdateGroupJSONRequestBody{Name: new("renamed")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot update name or slug of a linked group")
		got, err := tn.Admin.API.GetGroupByIdWithResponse(t.Context(), group.ID.String())
		require.NoError(t, err)
		require.NotNil(t, got.JSON200)
		require.Equal(t, group.Name, got.JSON200.Name)
	})

	t.Run("should change a linked group's role in the sub-org only", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.UpdateGroupWithResponse(t.Context(), group.ID.String(), api.UpdateGroupJSONRequestBody{Role: new("admin")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, "admin", groupRoleIn(t, sub.Admin.API, group.ID))
		require.Equal(t, "no-access", groupRoleIn(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse adding a root group to a sub-org project before it is linked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		projectID := sub.NewProject(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := sub.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), projectID, group.ID,
			"application/json", jsonBody(t, map[string]any{"roles": []map[string]any{permanent("viewer")}}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group "+group.ID.String()+" is missing organization membership")
		require.Empty(t, projectGroupIDs(t, sub.Admin.API, projectID))
	})

	t.Run("should add a root group to a sub-org project once it is linked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		projectID := sub.NewProject(t)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), projectID, group.ID,
			"application/json", jsonBody(t, map[string]any{"roles": []map[string]any{permanent("viewer")}}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		scoped := sub.Scope(t, member)
		waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, scoped.API, projectID) })
	})

	t.Run("should list linked root groups in the sub-org and offer only unlinked ones as available", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		linked, unlinked := fixture.NewGroup(t, tn), fixture.NewGroup(t, tn)
		sub.LinkGroup(t, linked, "member")

		// Action
		available := availableGroupIDs(t, sub.Admin.API)

		// Assert
		require.Equal(t, []uuid.UUID{unlinked.ID}, available)
		require.Equal(t, []uuid.UUID{linked.ID}, groupIDs(t, sub.Admin.API))
	})

	t.Run("should remove the group's sub-org project access when it is unlinked, and keep the root group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		projectID := sub.NewProject(t)
		member := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, member)
		sub.LinkGroup(t, group, "member")
		added, err := sub.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), projectID, group.ID,
			"application/json", jsonBody(t, map[string]any{"roles": []map[string]any{permanent("viewer")}}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, added.StatusCode(), added.Body)

		// Action
		res, err := sub.Admin.API.DeleteOrganizationGroupMembershipWithResponse(t.Context(), group.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotContains(t, projectGroupIDs(t, sub.Admin.API, projectID), group.ID)
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
		require.Equal(t, []uuid.UUID{member.ID}, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse unlinking from the root and keep the link", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := tn.Admin.API.DeleteOrganizationGroupMembershipWithResponse(t.Context(), group.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Parent organization cannot do this operation")
		require.Contains(t, groupIDs(t, sub.Admin.API), group.ID)
	})

	t.Run("should refuse unlinking the sub-org's own group and keep it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		own := sub.NewGroup(t, "own")

		// Action
		res, err := sub.Admin.API.DeleteOrganizationGroupMembershipWithResponse(t.Context(), own)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group 'own' belongs to this organization and can't be unlinked from it. Delete the group instead.")
		require.Equal(t, []uuid.UUID{own}, groupIDs(t, sub.Admin.API))
	})

	t.Run("should unlink rather than delete when a sub-org deletes a linked group, and audit it as an unlink", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		group := fixture.NewGroup(t, tn)
		sub.LinkGroup(t, group, "member")

		// Action
		res, err := sub.Admin.API.DeleteGroupWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotContains(t, groupIDs(t, sub.Admin.API), group.ID)
		require.Equal(t, []uuid.UUID{group.ID}, groupIDs(t, tn.Admin.API))
		event := auditEvent(t, sub.Admin.API, "unlink-group-from-sub-org", func(m map[string]any) bool {
			return m["groupId"] == group.ID.String()
		})
		require.Equal(t, group.Name, event["groupName"])
	})
}

func groupIdentityIDs(t *testing.T, client *api.ClientWithResponses, groupID uuid.UUID) []uuid.UUID {
	t.Helper()
	filter := api.ListGroupMachineIdentitiesParamsFilter("assignedMachineIdentities")
	res, err := client.ListGroupMachineIdentitiesWithResponse(t.Context(), groupID.String(), &api.ListGroupMachineIdentitiesParams{Filter: &filter})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	ids := []uuid.UUID{}
	for _, m := range res.JSON200.MachineIdentities {
		if m.IsPartOfGroup {
			ids = append(ids, m.Id)
		}
	}
	return ids
}
