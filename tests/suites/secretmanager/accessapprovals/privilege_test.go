package accessapprovals_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAccessApprovalRequest_Privilege(t *testing.T) {
	t.Parallel()

	t.Run("should list the privilege an approval grants as managed by its request, with the policy's approvers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))

		// Action
		approve(t, g.approver, requestID)

		// Assert
		ctx, admin := t.Context(), g.tn.Admin.API
		membership, err := admin.GetProjectMembershipByUserIdWithResponse(ctx, uuid.MustParse(g.proj.ID), g.requester.ID)
		require.NoError(t, err)
		require.NotNilf(t, membership.JSON200, "reading the requester's membership returned %d: %s",
			membership.StatusCode(), apierr.Body(membership.Body))
		listed, err := admin.ListUserProjectAdditionalPrivilegesWithResponse(ctx, &api.ListUserProjectAdditionalPrivilegesParams{
			ProjectMembershipId: membership.JSON200.Membership.Id.String(),
		})
		require.NoError(t, err)
		require.NotNilf(t, listed.JSON200, "listing privileges returned %d: %s", listed.StatusCode(), apierr.Body(listed.Body))
		require.Len(t, listed.JSON200.Privileges, 1)
		privilege := listed.JSON200.Privileges[0]
		require.True(t, privilege.IsLinkedToAccessApproval)
		require.NotNil(t, privilege.AccessApprovalRequestId)
		require.Equal(t, requestID, privilege.AccessApprovalRequestId.String())
		require.Equal(t, []uuid.UUID{g.approver.ID}, privilege.PolicyApproverUserIds)
	})
}
