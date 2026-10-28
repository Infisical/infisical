package accessapprovals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestAccessApprovalRequest_Review(t *testing.T) {
	t.Parallel()

	t.Run("should let the requester read the secret once the approver approves", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		approve(t, g.approver, requestID)

		// Assert
		approved := requestByID(t, g.proj, requestID)
		require.Equal(t, "approved", approved.Status)
		require.True(t, approved.IsApproved)
		require.NotNil(t, approved.Privilege)
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should close the request and grant nothing when the approver rejects", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.approver, requestID, "rejected")

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		rejected := requestByID(t, g.proj, requestID)
		require.Equal(t, "rejected", rejected.Status)
		require.False(t, rejected.IsApproved)
		require.Nil(t, rejected.Privilege)
		require.Equal(t, "The request has been closed", reviewAs(t, g.approver, requestID, "approved").message(t))
	})

	t.Run("should refuse a review from a project member the step does not name", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		bystander := g.proj.NewUser(t, fixture.WithPrincipalName("bystander"))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, bystander, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "You are not a reviewer in this step", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse a second review from the same approver", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		other := g.proj.NewUser(t, fixture.WithPrincipalName("other"))
		body := policyFor(g.proj, guardedPath, userApprover(g.approver), userApprover(other))
		body["approvals"] = 2
		newPolicy(t, g.proj, body)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, g.approver, requestID)

		// Action
		res := reviewAs(t, g.approver, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "You have already reviewed this request", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse the requester approving their own request when self-approval is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		body := policyFor(g.proj, guardedPath, userApprover(g.approver), userApprover(g.requester))
		body["allowedSelfApprovals"] = false
		newPolicy(t, g.proj, body)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t,
			"Failed to review access approval request. Users are not authorized to review their own request.",
			res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should let the requester approve their own request when self-approval is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		newPolicy(t, g.proj, policyFor(g.proj, guardedPath, userApprover(g.requester)))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		approve(t, g.requester, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should let the requester cancel their own request", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res := reviewAs(t, g.requester, requestID, "rejected")

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "rejected", statusOf(t, g.proj, requestID))
		require.Equal(t, "The request has been closed", reviewAs(t, g.approver, requestID, "approved").message(t))
	})
}

func TestAccessApprovalRequest_Steps(t *testing.T) {
	t.Parallel()

	// threeApprovers is a project with three approvers besides the requester, and
	// self-approval off so the requester can never count toward a step.
	threeApprovers := func(t *testing.T) (guarded, *harness.Principal, *harness.Principal, *harness.Principal) {
		t.Helper()
		g := newProject(t)
		b := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		c := g.proj.NewUser(t, fixture.WithPrincipalName("third"))
		return g, g.approver, b, c
	}
	withSteps := func(body policyBody, required ...int) policyBody {
		steps := make([]map[string]int, 0, len(required))
		for i, n := range required {
			steps = append(steps, map[string]int{"stepNumber": i + 1, "numberOfApprovals": n})
		}
		body["approvalsRequired"] = steps
		body["allowedSelfApprovals"] = false
		return body
	}

	t.Run("should approve on the second of three approvers when the step needs two, and close to the third", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, a, b, c := threeApprovers(t)
		newPolicy(t, g.proj, withSteps(policyFor(g.proj, guardedPath, userApprover(a), userApprover(b), userApprover(c)), 2))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, a, requestID)
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
		requireNothingGranted(t, g, requestID)

		// Action
		approve(t, b, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
		awaitRead(t, g.requester, g.proj, true)
		late := reviewAs(t, c, requestID, "approved")
		require.Equal(t, http.StatusBadRequest, late.status)
		require.Equal(t, "The request has been closed", late.message(t))
	})

	t.Run("should approve on the first of two approvers when the step needs one", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, a, b, _ := threeApprovers(t)
		newPolicy(t, g.proj, withSteps(policyFor(g.proj, guardedPath, userApprover(a), userApprover(b)), 1))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		approve(t, b, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
		require.Equal(t, "The request has been closed", reviewAs(t, a, requestID, "approved").message(t))
	})

	t.Run("should need the policy's approvals on a first step that has no approvalsRequired entry", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, a, b, _ := threeApprovers(t)
		body := policyFor(g.proj, guardedPath, userApprover(a), userApprover(b))
		body["approvals"] = 2
		body["allowedSelfApprovals"] = false
		newPolicy(t, g.proj, body)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, a, requestID)
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
		requireNothingGranted(t, g, requestID)

		// Action
		approve(t, b, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should open the second step only after the first, and need its own two approvals", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, a, b, c := threeApprovers(t)
		newPolicy(t, g.proj, withSteps(policyFor(g.proj, guardedPath,
			userApprover(a).inStep(1), userApprover(b).inStep(2), userApprover(c).inStep(2)), 1, 2))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		early := reviewAs(t, b, requestID, "approved")
		require.Equal(t, http.StatusBadRequest, early.status)
		require.Equal(t, "You are not a reviewer in this step", early.message(t))
		approve(t, a, requestID)
		requireNothingGranted(t, g, requestID)
		approve(t, b, requestID)
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
		requireNothingGranted(t, g, requestID)

		// Action
		approve(t, c, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
		awaitRead(t, g.requester, g.proj, true)
	})

	t.Run("should count each approving member of an approver group once", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		first, second := g.tn.NewUser(t, harness.WithName("first")), g.tn.NewUser(t, harness.WithName("second"))
		approvers := fixture.NewGroup(t, g.tn)
		approvers.AddUser(t, first, second)
		g.proj.GrantGroup(t, approvers)
		newPolicy(t, g.proj, withSteps(policyFor(g.proj, guardedPath, groupApprover(approvers)), 2))
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, first, requestID)
		require.Equal(t, "You have already reviewed this request", reviewAs(t, first, requestID, "approved").message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))

		// Action
		approve(t, second, requestID)

		// Assert
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
	})
}

func TestAccessApprovalRequest_PolicyChange(t *testing.T) {
	t.Parallel()

	globPath := guardedPath + "/*"
	globbed := func(t *testing.T) (guarded, string) {
		t.Helper()
		g := newGuarded(t, func(b policyBody) { b["secretPath"] = globPath })
		return g, openRequest(t, g.requester, g.proj, globPath, nil)
	}
	approverOnly := func(g guarded) []map[string]any { return subjects([]approver{userApprover(g.approver)}) }

	t.Run("should refuse approval once the policy no longer covers the requested path", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, requestID := globbed(t)
		moved := updatePolicy(t, g.proj, g.policyID, policyBody{"secretPath": "/other", "approvers": approverOnly(g)})
		require.Equal(t, http.StatusOK, moved.status)

		// Action
		res := reviewAs(t, g.approver, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "The policy no longer covers secret path '"+globPath+"'.", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})

	t.Run("should still allow rejecting a request the policy no longer covers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, requestID := globbed(t)
		moved := updatePolicy(t, g.proj, g.policyID, policyBody{"secretPath": "/other", "approvers": approverOnly(g)})
		require.Equal(t, http.StatusOK, moved.status)

		// Action
		res := reviewAs(t, g.approver, requestID, "rejected")

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		rejected := requestByID(t, g.proj, requestID)
		require.Equal(t, "rejected", rejected.Status)
		require.Nil(t, rejected.Privilege)
	})

	t.Run("should approve when a broader policy path still covers the requested path", func(t *testing.T) {
		t.Parallel()

		// Setup
		g, requestID := globbed(t)
		broader := updatePolicy(t, g.proj, g.policyID, policyBody{"secretPath": guardedPath + "/**", "approvers": approverOnly(g)})
		require.Equal(t, http.StatusOK, broader.status)

		// Action
		res := reviewAs(t, g.approver, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "approved", statusOf(t, g.proj, requestID))
	})

	t.Run("should refuse approval once the policy no longer includes the requested environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		moved := updatePolicy(t, g.proj, g.policyID, policyBody{"environments": []string{"prod"}, "approvers": approverOnly(g)})
		require.Equal(t, http.StatusOK, moved.status)

		// Action
		res := reviewAs(t, g.approver, requestID, "approved")

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "The policy is no longer attached to environment 'dev'.", res.message(t))
		require.Equal(t, "pending", statusOf(t, g.proj, requestID))
	})
}

func TestAccessApprovalRequest_PolicyChangeSteps(t *testing.T) {
	t.Parallel()

	// pastStepOne is a request whose first step the first approver has completed, on a
	// two-step policy: first approver, then second.
	type pastStepOne struct {
		guarded
		second, third *harness.Principal
		requestID     string
	}
	setup := func(t *testing.T) pastStepOne {
		t.Helper()
		g := newProject(t)
		second := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		third := g.proj.NewUser(t, fixture.WithPrincipalName("third"))
		body := policyFor(g.proj, guardedPath, userApprover(g.approver).inStep(1), userApprover(second).inStep(2))
		body["allowedSelfApprovals"] = false
		g.policyID = newPolicy(t, g.proj, body)
		requestID := openRequest(t, g.requester, g.proj, guardedPath, nil)
		approve(t, g.approver, requestID)
		return pastStepOne{guarded: g, second: second, third: third, requestID: requestID}
	}
	twoSteps := func(p pastStepOne, extra ...approver) []map[string]any {
		return subjects(append([]approver{userApprover(p.approver).inStep(1), userApprover(p.second).inStep(2)}, extra...))
	}

	t.Run("should restart pending requests at the first step when the policy's path changes", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := setup(t)

		// Action
		res := updatePolicy(t, p.proj, p.policyID, policyBody{"secretPath": guardedPath + "/**", "approvers": twoSteps(p)})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "You are not a reviewer in this step", reviewAs(t, p.second, p.requestID, "approved").message(t))
		approve(t, p.approver, p.requestID)
		approve(t, p.second, p.requestID)
		require.Equal(t, "approved", statusOf(t, p.proj, p.requestID))
	})

	t.Run("should restart pending requests with the updated approvers when the policy's environments change", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := setup(t)

		// Action
		res := updatePolicy(t, p.proj, p.policyID, policyBody{
			"environments": []string{"dev", "prod"},
			"approvers":    twoSteps(p, userApprover(p.third).inStep(1)),
		})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "You are not a reviewer in this step", reviewAs(t, p.second, p.requestID, "approved").message(t))
		approve(t, p.third, p.requestID)
		approve(t, p.second, p.requestID)
		require.Equal(t, "approved", statusOf(t, p.proj, p.requestID))
	})

	t.Run("should keep open requests on their steps and put new requests on the changed steps when only the approvers change", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := setup(t)
		later := p.proj.NewUser(t, fixture.WithPrincipalName("later"), fixture.WithRoles("requester"))

		// Action
		res := updatePolicy(t, p.proj, p.policyID, policyBody{
			"secretPath":   guardedPath,
			"environments": []string{"dev"},
			"approvers":    subjects([]approver{userApprover(p.approver).inStep(1), userApprover(p.third).inStep(2)}),
		})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, "You are not a reviewer in this step", reviewAs(t, p.third, p.requestID, "approved").message(t))
		approve(t, p.second, p.requestID)
		require.Equal(t, "approved", statusOf(t, p.proj, p.requestID))
		newID := openRequest(t, later, p.proj, guardedPath, nil)
		approve(t, p.approver, newID)
		require.Equal(t, "You are not a reviewer in this step", reviewAs(t, p.second, newID, "approved").message(t))
		approve(t, p.third, newID)
		require.Equal(t, "approved", statusOf(t, p.proj, newID))
	})

	t.Run("should leave pending requests at their step when the same path and environments are sent again", func(t *testing.T) {
		t.Parallel()

		// Setup
		p := setup(t)

		// Action
		res := updatePolicy(t, p.proj, p.policyID, policyBody{
			"name":         "renamed",
			"secretPath":   guardedPath,
			"environments": []string{"dev"},
			"approvers":    twoSteps(p),
		})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		approve(t, p.second, p.requestID)
		require.Equal(t, "approved", statusOf(t, p.proj, p.requestID))
	})
}
