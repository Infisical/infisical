package accessapprovals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/stretchr/testify/require"
)

const bypassReason = "incident INC-1234 needs the production key now"

func TestAccessApprovalRequest_BreakGlass(t *testing.T) {
	t.Parallel()

	// soft is a soft policy with self-approval off, so the only way past the approver
	// is break glass.
	soft := func(bypassers ...approver) func(policyBody) {
		return func(b policyBody) {
			b["enforcementLevel"] = "soft"
			b["allowedSelfApprovals"] = false
			if len(bypassers) > 0 {
				b["bypassers"] = subjects(bypassers)
			}
		}
	}
	softBypassedBy := func(t *testing.T, bypasser func(guarded) approver) guarded {
		t.Helper()
		g := newProject(t)
		body := policyFor(g.proj, guardedPath, userApprover(g.approver))
		soft(bypasser(g))(body)
		g.policyID = newPolicy(t, g.proj, body)
		return g
	}
	requesterBypasses := func(g guarded) approver { return userApprover(g.requester) }
	approverBypasses := func(g guarded) approver { return userApprover(g.approver) }

	t.Run("should let a listed bypasser approve their own request with a reason and read the secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, requesterBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		withoutReason := reviewAs(t, g.requester, requestID, "approved")
		require.Equal(t, http.StatusBadRequest, withoutReason.status, "self-approval is off, so only a reason may bypass")

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		bypassed := requestByID(t, g.proj, requestID)
		require.Equal(t, "approved", bypassed.Status)
		require.NotNil(t, bypassed.BypassReason)
		require.Equal(t, bypassReason, *bypassed.BypassReason)
		require.Equal(t, []string{g.requester.ID.String()}, bypassed.Policy.Bypassers)
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should let a member of a bypasser group approve their own request with a reason and read the secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, func(g guarded) approver {
			bypassers := fixture.NewGroup(t, g.tn)
			bypassers.AddUser(t, g.requester)
			return groupApprover(bypassers)
		})
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		bypassed := requestByID(t, g.proj, requestID)
		require.Equal(t, "approved", bypassed.Status)
		require.NotNil(t, bypassed.BypassReason)
		require.Equal(t, bypassReason, *bypassed.BypassReason)
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should refuse break glass from a requester outside the bypasser group", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, func(g guarded) approver {
			bypassers := fixture.NewGroup(t, g.tn)
			bypassers.AddUser(t, g.approver)
			return groupApprover(bypassers)
		})
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You are not permitted to bypass approval on this request", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should email the approvers when a request is bypassed", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, requesterBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		g.tn.Mail(t).Expect(t, g.approver.Email, smtp.Subject("Infisical Secret Access Policy Bypassed"))
	})

	t.Run("should refuse break glass on a soft policy with no bypassers when self-approval is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, soft())
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You are not permitted to bypass approval on this request", res.message(t))
		pending := requestByID(t, g.proj, requestID)
		require.Equal(t, "pending", pending.Status)
		require.Nil(t, pending.Privilege)
	})

	t.Run("should refuse break glass from a requester the bypasser list does not name", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, approverBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You are not permitted to bypass approval on this request", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should let only the requester break glass, even when the actor is an approver and a bypasser", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, approverBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.approver, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You are not permitted to bypass approval on this request", res.message(t))
		approve(t, g.approver, requestID)
		approved := requestByID(t, g.proj, requestID)
		require.Equal(t, "approved", approved.Status)
		require.Nil(t, approved.BypassReason, "an ordinary approval was recorded as a bypass")
	})

	t.Run("should refuse break glass on a hard policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved", bypassReason)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Equal(t, "You are not permitted to bypass approval on this request", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse a bypass reason given with a rejection", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, requesterBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "rejected", bypassReason)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "A bypass reason can only be provided when approving a request", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse a bypass reason shorter than ten characters", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := softBypassedBy(t, requesterBypasses)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		short := reviewAs(t, g.requester, requestID, "approved", "too short")
		padded := reviewAs(t, g.requester, requestID, "approved", "   short    ")

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, short.status)
		require.Equal(t, http.StatusBadRequest, padded.status)
		require.Equal(t, "A bypass reason of at least 10 characters is required to bypass approvals", padded.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})
}
