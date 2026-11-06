package accessapprovals_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestAccessApprovalRequest_Create(t *testing.T) {
	t.Parallel()

	t.Run("should open a pending request on the policy that covers the path", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := openAs(t, g.requester, g.proj, guardedPath, nil)

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "opening returned %s", apierr.Body(res.body))
		var opened struct {
			Approval struct {
				ID       string `json:"id"`
				PolicyID string `json:"policyId"`
				Status   string `json:"status"`
			} `json:"approval"`
		}
		require.NoError(t, json.Unmarshal(res.body, &opened))
		require.Equal(t, g.policyID, opened.Approval.PolicyID)
		require.Equal(t, "pending", opened.Approval.Status)
		listed := requestByID(t, g.proj, opened.Approval.ID)
		require.Equal(t, "pending", listed.Status)
		require.Equal(t, g.requester.ID.String(), listed.RequestedByUser.UserID)
	})

	t.Run("should refuse a request when no policy covers the path and open nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := openAs(t, g.requester, g.proj, "/other", nil)

		// Assert
		require.Equal(t, http.StatusNotFound, res.status)
		require.Equal(t, "No policy in environment with slug 'dev' and with secret path '/other' was found.", res.message(t))
		require.Empty(t, listRequests(t, g.proj))
	})

	t.Run("should refuse a temporary request without a range and open nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := openAs(t, g.requester, g.proj, guardedPath, map[string]any{"isTemporary": true})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "A temporary range is required for temporary requests", res.message(t))
		require.Empty(t, listRequests(t, g.proj))
	})

	t.Run("should refuse a range over the policy maximum, and a permanent request, and open nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, func(b policyBody) { b["maxTimePeriod"] = "1h" })

		// Action
		tooLong := openAs(t, g.requester, g.proj, guardedPath, temporary("2h"))
		permanent := openAs(t, g.requester, g.proj, guardedPath, nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, tooLong.status)
		require.Equal(t, "Requested access time range is limited to 1h by policy", tooLong.message(t))
		require.Equal(t, http.StatusBadRequest, permanent.status)
		require.Equal(t, "Requested access time range is limited to 1h by policy", permanent.message(t))
		require.Empty(t, listRequests(t, g.proj))
	})

	t.Run("should open a request whose range is within the policy maximum", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, func(b policyBody) { b["maxTimePeriod"] = "1h" })

		// Action
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("30m"))

		// Assert
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse a second pending request for the same access", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		first := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := openAs(t, g.requester, g.proj, guardedPath, nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "You already have a pending access request with the same criteria", res.message(t))
		listed := listRequests(t, g.proj)
		require.Len(t, listed, 1)
		require.Equal(t, first, listed[0].ID)
	})

	t.Run("should refuse a request for access the requester already holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		approve(t, g.approver, openRequest(t, g.requester, g.proj, guardedPath, temporary("1h")))

		// Action
		res := openAs(t, g.requester, g.proj, guardedPath, temporary("1h"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "You already have an active privilege with the same criteria", res.message(t))
		require.Len(t, listRequests(t, g.proj), 1)
	})

	t.Run("should grant temporary access when a range is sent without isTemporary", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, map[string]any{"isTemporary": false, "temporaryRange": "1h"})

		// Action
		approve(t, g.approver, requestID)

		// Assert
		privilege := requestByID(t, g.proj, requestID).Privilege
		require.NotNil(t, privilege)
		require.True(t, privilege.IsTemporary)
		require.NotNil(t, privilege.TemporaryRange)
		require.Equal(t, "1h", *privilege.TemporaryRange)
	})

	t.Run("should refuse a machine identity opening a request and open nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		identity := g.proj.NewMachineIdentity(t, fixture.WithRoles("requester"))

		// Action
		res := openAs(t, identity, g.proj, guardedPath, nil)

		// Assert
		require.Equal(t, http.StatusForbidden, res.status)
		require.Empty(t, listRequests(t, g.proj))
	})

	t.Run("should refuse editing a request", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))

		// Action
		res, err := g.tn.Admin.API.UpdateAccessApprovalRequestWithResponse(t.Context(), requestID,
			api.UpdateAccessApprovalRequestJSONRequestBody{TemporaryRange: "30m", EditNote: "shorter"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Access requests on the global approval system cannot be edited", reply{res.StatusCode(), res.Body}.message(t))
		listed := requestByID(t, g.proj, requestID)
		require.NotNil(t, listed.TemporaryRange)
		require.Equal(t, "1h", *listed.TemporaryRange)
	})
}

func TestAccessApprovalRequest_List(t *testing.T) {
	t.Parallel()

	t.Run("should list approved and pending requests with their reviewers and count them apart", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		newPolicy(t, g.proj, policyFor(g.proj, "/pending", userApprover(g.approver)))
		approvedID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		approve(t, g.approver, approvedID)
		pendingID := openRequest(t, g.requester, g.proj, "/pending", nil)

		// Action
		approved, pending := requestByID(t, g.proj, approvedID), requestByID(t, g.proj, pendingID)

		// Assert
		require.True(t, approved.IsApproved)
		require.True(t, approved.IsTemporary)
		require.NotNil(t, approved.Privilege)
		require.Equal(t, guardedPath, approved.Policy.SecretPath)
		require.Len(t, approved.Reviewers, 1)
		require.Equal(t, g.approver.ID.String(), approved.Reviewers[0].UserID)
		require.Equal(t, "approved", approved.Reviewers[0].Status)
		require.NotNil(t, approved.ApprovedByUser)
		require.Equal(t, g.approver.ID.String(), approved.ApprovedByUser.UserID)
		require.False(t, pending.IsApproved)
		require.Nil(t, pending.Privilege)
		require.Empty(t, pending.Reviewers)
		count, err := g.tn.Admin.API.GetAccessApprovalRequestCountWithResponse(t.Context(),
			&api.GetAccessApprovalRequestCountParams{ProjectSlug: g.proj.Slug})
		require.NoError(t, err)
		require.NotNilf(t, count.JSON200, "counting returned %s", apierr.Body(count.Body))
		require.Equal(t, float32(1), count.JSON200.PendingCount)
		require.Equal(t, float32(1), count.JSON200.FinalizedCount)
	})
}

func TestAccessApprovalRequest_Notify(t *testing.T) {
	t.Parallel()

	t.Run("should email the user approver and each member of an approver group when a request opens", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		grouped := g.tn.NewUser(t, harness.WithName("grouped"))
		approvers := fixture.NewGroup(t, g.tn)
		approvers.AddUser(t, grouped)
		g.proj.GrantGroup(t, approvers)
		newPolicy(t, g.proj, policyFor(g.proj, guardedPath, userApprover(g.approver), groupApprover(approvers)))

		// Action
		openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Assert
		g.tn.Mail(t).Expect(t, g.approver.Email, smtp.Subject("Access Approval Request"))
		g.tn.Mail(t).Expect(t, grouped.Email, smtp.Subject("Access Approval Request"))
	})

	t.Run("should email the next step's approver once the first step completes", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		second := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		newPolicy(t, g.proj, policyFor(g.proj, guardedPath, userApprover(g.approver).inStep(1), userApprover(second).inStep(2)))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		g.tn.Mail(t).Expect(t, g.approver.Email, smtp.Subject("Access Approval Request"))
		g.tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
			return e.Recipient == strings.ToLower(second.Email) && strings.Contains(e.Message.Subject, "Access Approval Request")
		})

		// Action
		approve(t, g.approver, requestID)

		// Assert
		g.tn.Mail(t).Expect(t, second.Email, smtp.Subject("Access Approval Request"))
	})
}
