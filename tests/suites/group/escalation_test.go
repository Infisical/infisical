package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func groupsRule(actions ...string) fixture.Permission {
	return fixture.Permission{Subject: "groups", Action: actions}
}

func TestGroup_Escalation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse adding a user to a group without add-members, and add nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "group-editor", groupsRule("read", "edit"))
		actor := tn.NewUser(t, harness.OrgRole("group-editor"))
		target := tn.NewUser(t)
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := actor.API.AddUserToGroupWithResponse(t.Context(), group.ID.String(), target.Email)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to add user to more privileged group")
		require.Contains(t, string(res.Body), "add-members on groups")
		require.Empty(t, fixture.GroupUserIDs(t, tn.Admin.API, group.ID))
	})

	t.Run("should refuse creating an admin group without grant-privileges on groups, and create none", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Under the new privilege system, giving a group any role but no-access needs
			grant-privileges on groups; the role is not compared with the actor's own.`)

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "group-creator", groupsRule("read", "create"))
		actor := tn.NewUser(t, harness.OrgRole("group-creator"))

		// Action
		res, err := actor.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{
			Name: "escalated", Role: new("admin"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to create group. Permission denied: grant-privileges on groups")
		require.NotContains(t, groupNames(t, tn.Admin.API), "escalated")
	})

	t.Run("should refuse changing a more privileged group's role, and keep its role", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "group-editor", groupsRule("read", "edit"))
		actor := tn.NewUser(t, harness.OrgRole("group-editor"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))

		// Action
		res, err := actor.API.UpdateGroupWithResponse(t.Context(), group.ID.String(), api.UpdateGroupJSONRequestBody{
			Role: new("member"),
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to change the roles of a more privileged group")
		require.Equal(t, "admin", groupRole(t, tn, group.ID))
	})

	t.Run("should refuse deleting a group without delete on groups, and keep it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The new privilege system bounds deletion by the delete action alone, so an
			actor who may delete groups may delete an admin one.`)

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "group-editor", groupsRule("read", "edit"))
		actor := tn.NewUser(t, harness.OrgRole("group-editor"))
		group := fixture.NewGroup(t, tn, fixture.WithGroupRole("admin"))

		// Action
		res, err := actor.API.DeleteGroupWithResponse(t.Context(), group.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You are not allowed to delete on groups")
		require.Contains(t, groupNames(t, tn.Admin.API), group.Name)
	})

	t.Run("should refuse adding a group to a project with a role above the actor's own", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "group-assigner",
			fixture.Permission{Subject: "groups", Action: []string{"read", "create"}},
			fixture.Permission{Subject: "groups", Action: []string{"assign-role"},
				Conditions: map[string]any{"assignableRole": map[string]any{"$eq": "viewer"}}})
		actor := proj.NewUser(t, fixture.WithRoles("group-assigner"))
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := actor.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), proj.ID, group.ID,
			"application/json", rolesBody(t, permanent("admin")))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to create group project membership")
		require.NotContains(t, projectGroupIDs(t, tn.Admin.API, proj.ID), group.ID)
	})

	t.Run("should refuse removing a more privileged group from a project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "group-remover",
			fixture.Permission{Subject: "groups", Action: []string{"read"}},
			fixture.Permission{Subject: "groups", Action: []string{"delete"},
				Conditions: map[string]any{"assignableRole": map[string]any{"$ne": "admin"}}})
		actor := proj.NewUser(t, fixture.WithRoles("group-remover"))
		group := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, group, "admin")

		// Action
		res, err := actor.API.RemoveProjectGroupMembershipWithResponse(t.Context(), proj.ID, group.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to remove a more privileged group from the project")
		require.Contains(t, projectGroupIDs(t, tn.Admin.API, proj.ID), group.ID)
	})
}
