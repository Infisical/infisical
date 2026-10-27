package accessapprovals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func membershipID(t *testing.T, proj *fixture.Project, user *harness.Principal) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListProjectMembershipsWithResponse(t.Context(), proj.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing memberships returned %s", apierr.Body(res.Body))
	for _, m := range res.JSON200.Memberships {
		if m.User.Id == user.ID {
			return m.Id.String()
		}
	}
	require.Failf(t, "not a member", "%s has no membership in %s", user.Email, proj.Slug)
	return ""
}

func removeUsers(t *testing.T, proj *fixture.Project, users ...*harness.Principal) reply {
	t.Helper()
	usernames := make([]string, 0, len(users))
	for _, u := range users {
		usernames = append(usernames, u.Email)
	}
	res, err := proj.Tenant().Admin.API.RemoveProjectMembersWithResponse(t.Context(), proj.ID,
		api.RemoveProjectMembersJSONRequestBody{Usernames: &usernames})
	require.NoError(t, err)
	return reply{res.StatusCode(), res.Body}
}

func deletePolicy(t *testing.T, proj *fixture.Project, policyID string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.DeleteAccessApprovalPolicyWithResponse(t.Context(), policyID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the policy returned %s", apierr.Body(res.Body))
}

func TestAccessApprovalMembership_Remove(t *testing.T) {
	t.Parallel()

	t.Run("should revoke only the removed member's grants", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		stays := g.proj.NewUser(t, fixture.WithPrincipalName("stays"), fixture.WithRoles("requester"))
		leaving := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		staying := openRequest(t, stays, g.proj, guardedPath, temporary("1h"))
		approve(t, g.approver, leaving)
		approve(t, g.approver, staying)

		// Action
		res, err := g.tn.Admin.API.DeleteProjectMembershipWithResponse(t.Context(), g.proj.ID, membershipID(t, g.proj, g.requester))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the member returned %s", apierr.Body(res.Body))
		removed, kept := requestByID(t, g.proj, leaving), requestByID(t, g.proj, staying)
		require.Equal(t, "revoked", removed.Status)
		require.Nil(t, removed.Privilege)
		require.Nil(t, removed.RevokedByUser, "the membership removal, not a user, revoked the grant")
		require.Equal(t, "approved", kept.Status)
		require.NotNil(t, kept.Privilege)
		awaitRead(t, stays, g.proj, true)
	})

	t.Run("should refuse removing a user approver from the project until the policy is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, func(b policyBody) { b["name"] = "app-access" })

		// Action
		blocked := removeUsers(t, g.proj, g.approver)

		// Assert
		require.Equal(t, http.StatusBadRequest, blocked.status)
		require.Equal(t, "Cannot remove user from project: user is an approver in access approval policy: app-access",
			blocked.message(t))
		membershipID(t, g.proj, g.approver)
		deletePolicy(t, g.proj, g.policyID)
		removed := removeUsers(t, g.proj, g.approver)
		require.Equalf(t, http.StatusOK, removed.status, "removing after the policy is gone returned %s", apierr.Body(removed.body))
	})

	t.Run("should refuse removing a group approver from the project until the policy is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		approvers := fixture.NewGroup(t, g.tn)
		g.proj.GrantGroup(t, approvers)
		body := policyFor(g.proj, guardedPath, groupApprover(approvers))
		body["name"] = "app-access"
		policyID := newPolicy(t, g.proj, body)

		// Action
		blocked, err := g.tn.Admin.API.RemoveProjectGroupMembershipWithResponse(t.Context(), g.proj.ID, approvers.ID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t, "Cannot remove group from project: group is an approver in access approval policy: app-access",
			reply{blocked.StatusCode(), blocked.Body}.message(t))
		deletePolicy(t, g.proj, policyID)
		removed, err := g.tn.Admin.API.RemoveProjectGroupMembershipWithResponse(t.Context(), g.proj.ID, approvers.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, removed.StatusCode(), "removing after the policy is gone returned %s", apierr.Body(removed.Body))
	})
}
