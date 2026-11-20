package group_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestGroup_Project(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should remove access from every member when the group is removed from the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		user := tn.NewUser(t)
		identity := tn.NewMachineIdentity(t)
		group := fixture.NewGroup(t, tn)
		group.AddUser(t, user)
		group.AddIdentity(t, identity)
		proj.GrantGroup(t, group, "viewer")
		for _, p := range []*harness.Principal{user, identity} {
			waitForStatus(t, http.StatusOK, func() (int, []byte) { return listSecrets(t, p.API, proj.ID) })
		}

		// Action
		res, err := tn.Admin.API.RemoveProjectGroupMembershipWithResponse(t.Context(), proj.ID, group.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		for _, p := range []*harness.Principal{user, identity} {
			body := waitForStatus(t, http.StatusForbidden, func() (int, []byte) { return listSecrets(t, p.API, proj.ID) })
			require.Contains(t, string(body), "You are not a member of this project")
		}
	})

	t.Run("should refuse a group membership with only temporary roles and add nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), proj.ID, group.ID,
			"application/json", rolesBody(t, expired("viewer")))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Group must have at least one permanent role")
		require.NotContains(t, projectGroupIDs(t, tn.Admin.API, proj.ID), group.ID)
	})

	t.Run("should refuse a temporary role without a start time and range and add nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		group := fixture.NewGroup(t, tn)

		// Action
		res, err := tn.Admin.API.CreateProjectGroupMembershipWithBodyWithResponse(t.Context(), proj.ID, group.ID,
			"application/json", rolesBody(t, permanent("viewer"), map[string]any{"role": "admin", "isTemporary": true}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.NotContains(t, projectGroupIDs(t, tn.Admin.API, proj.ID), group.ID)
	})

	t.Run("should refuse removing a group that is an approver on a policy, naming the policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		group := fixture.NewGroup(t, tn)
		proj.GrantGroup(t, group, "member")
		policy, err := tn.Admin.API.CreateAccessApprovalPolicyWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{
				"name":        "guarded-by-group",
				"projectSlug": proj.Slug,
				"environment": "dev",
				"secretPath":  "/",
				"approvals":   1,
				"approvers":   []map[string]any{{"type": "group", "id": group.ID.String()}},
			}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, policy.StatusCode(), policy.Body)

		// Action
		res, err := tn.Admin.API.RemoveProjectGroupMembershipWithResponse(t.Context(), proj.ID, group.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Cannot remove group from project: group is an approver in access approval policy: guarded-by-group")
		require.Contains(t, projectGroupIDs(t, tn.Admin.API, proj.ID), group.ID)
	})

	t.Run("should refuse a group name that matches both a root and a linked group, naming the fix", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		rootGroup := fixture.NewGroup(t, tn)
		sub.NewGroup(t, rootGroup.Name)
		sub.LinkGroup(t, rootGroup)
		projectID := sub.NewProject(t)

		// Action
		//lint:ignore SA1019 the deprecated route is the only one that resolves a group by name
		res, err := sub.Admin.API.AddGroupToProjectWithBodyWithResponse(t.Context(), projectID, rootGroup.Name,
			"application/json", jsonBody(t, map[string]any{"role": "viewer"}))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body),
			"Multiple groups with name '"+rootGroup.Name+"' are visible in this organization. Use the group ID instead.")
		require.Empty(t, projectGroupIDs(t, sub.Admin.API, projectID))
	})
}
