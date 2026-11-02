package accessapprovals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestAccessApprovalRequest_Expiry(t *testing.T) {
	t.Parallel()

	t.Run("should remove the requester's access once the approved range runs out", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `A grant starts when it is approved, so the range cannot be moved into the past. It
			is longer than the ten seconds the permission cache may hide the new grant for.`)

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("20s"))

		// Action
		approve(t, g.approver, requestID)

		// Assert
		awaitRead(t, g.requester, g.proj, true)
		awaitRead(t, g.requester, g.proj, false)
	})
}

func TestAccessApprovalRequest_Revoke(t *testing.T) {
	t.Parallel()

	t.Run("should remove the requester's access and report the request revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		approve(t, g.approver, requestID)
		awaitRead(t, g.requester, g.proj, true)

		// Action
		res := revokeAs(t, g.tn.Admin, requestID)

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		revoked := requestByID(t, g.proj, requestID)
		require.Equal(t, "revoked", revoked.Status)
		require.Nil(t, revoked.Privilege)
		require.NotNil(t, revoked.RevokedByUser)
		require.Equal(t, g.tn.Admin.ID.String(), revoked.RevokedByUser.UserID)
		awaitRead(t, g.requester, g.proj, false)
	})

	t.Run("should let an approver of the policy revoke a grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, g.approver, requestID)

		// Action
		res := revokeAs(t, g.approver, requestID)

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "revoked", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse revoking a request twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, g.approver, requestID)
		require.Equal(t, http.StatusOK, revokeAs(t, g.tn.Admin, requestID).status)

		// Action
		res := revokeAs(t, g.tn.Admin, requestID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "Only approved requests can be revoked", res.message(t))
		require.Equal(t, "revoked", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse revoking a request that is not approved", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := revokeAs(t, g.tn.Admin, requestID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "Only approved requests can be revoked", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse a revoke by a member who is not an approver and cannot assign privileges", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		bystander := g.proj.NewUser(t, fixture.WithPrincipalName("bystander"))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, g.approver, requestID)

		// Action
		res := revokeAs(t, bystander, requestID)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You do not have permission to revoke additional privileges for this user", res.message(t))
		approved := requestByID(t, g.proj, requestID)
		require.Equal(t, "approved", approved.Status)
		require.NotNil(t, approved.Privilege)
	})

	t.Run("should refuse editing the privilege an approval granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		approve(t, g.approver, requestID)
		privilegeID := requestByID(t, g.proj, requestID).PrivilegeID
		require.NotNil(t, privilegeID)

		// Action
		res, err := g.tn.Admin.API.UpdateUserProjectAdditionalPrivilegeWithBodyWithResponse(t.Context(), *privilegeID,
			"application/json", jsonBody(t, map[string]any{"type": map[string]any{"isTemporary": false}}))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Cannot update a privilege that was granted through an access approval request",
			reply{res.StatusCode(), res.Body}.message(t))
		privilege := requestByID(t, g.proj, requestID).Privilege
		require.NotNil(t, privilege)
		require.True(t, privilege.IsTemporary)
	})
}
