package accessapprovals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func approvalsRequired(policy policyView) []int {
	out := make([]int, 0, len(policy.Approvers))
	for _, a := range policy.Approvers {
		out = append(out, a.ApprovalsRequired)
	}
	return out
}

func TestAccessApprovalPolicy_Create(t *testing.T) {
	t.Parallel()

	t.Run("should create a policy naming a group approver that is in the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		approvers := fixture.NewGroup(t, g.tn)
		g.proj.GrantGroup(t, approvers)

		// Action
		res := createPolicyAs(t, g.tn.Admin, policyFor(g.proj, guardedPath, groupApprover(approvers)))

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "creating returned %s", apierr.Body(res.body))
		require.Len(t, policyIDs(t, g.proj), 1)
	})

	t.Run("should refuse a group approver that is not in the project and create no policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		outsiders := fixture.NewGroup(t, g.tn)

		// Action
		res := createPolicyAs(t, g.tn.Admin, policyFor(g.proj, guardedPath, groupApprover(outsiders)))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "Some groups are not members of the project: "+outsiders.ID.String(), res.message(t))
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should refuse a user approver that is not in the project and create no policy", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		outsider := g.tn.NewUser(t, harness.WithName("outsider"))

		// Action
		res := createPolicyAs(t, g.tn.Admin, policyFor(g.proj, guardedPath, userApprover(outsider)))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "Some users are not members of the project: "+outsider.ID.String(), res.message(t))
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should refuse a second policy on the same environment and path", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := createPolicyAs(t, g.tn.Admin, policyFor(g.proj, guardedPath, userApprover(g.approver)))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "A policy for secret path '/app' already exists in environment 'dev'", res.message(t))
		require.Equal(t, []string{g.policyID}, policyIDs(t, g.proj))
	})

	t.Run("should refuse a later step needing more approvals than it has approvers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		second := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		body := policyFor(g.proj, guardedPath, userApprover(g.approver).inStep(1), userApprover(second).inStep(2))
		body["approvalsRequired"] = []map[string]int{{"stepNumber": 1, "numberOfApprovals": 1}, {"stepNumber": 2, "numberOfApprovals": 2}}

		// Action
		res := createPolicyAs(t, g.tn.Admin, body)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t,
			"Step 2 requires 2 approvals but only has 1 approver. Add approvers to the step or lower its required approvals.",
			res.message(t))
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should refuse more approvals than the first step has user approvers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		body := policyFor(g.proj, guardedPath, userApprover(g.approver))
		body["approvals"] = 2

		// Action
		res := createPolicyAs(t, g.tn.Admin, body)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Contains(t, res.message(t), "Step 1 requires 2 approvals but only has 1 approver")
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should return a user once per step when they approve in two steps", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		twice := g.proj.NewUser(t, fixture.WithPrincipalName("twice"))
		body := policyFor(g.proj, guardedPath,
			userApprover(g.approver).inStep(1), userApprover(twice).inStep(1), userApprover(twice).inStep(2))
		body["approvalsRequired"] = []map[string]int{{"stepNumber": 1, "numberOfApprovals": 2}, {"stepNumber": 2, "numberOfApprovals": 1}}

		// Action
		policyID := newPolicy(t, g.proj, body)

		// Assert
		got := map[[2]any]int{}
		for _, a := range mustGetPolicy(t, g.proj, policyID).Approvers {
			got[[2]any{a.ID, a.Sequence}] = a.ApprovalsRequired
		}
		require.Equal(t, map[[2]any]int{
			{g.approver.ID.String(), 1}: 2,
			{twice.ID.String(), 1}:      2,
			{twice.ID.String(), 2}:      1,
		}, got)
	})

	t.Run("should read approvals back as written when no approvalsRequired is sent", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		second := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		body := policyFor(g.proj, guardedPath, userApprover(g.approver), userApprover(second))
		body["approvals"] = 2

		// Action
		policyID := newPolicy(t, g.proj, body)

		// Assert
		require.Equal(t, 2, mustGetPolicy(t, g.proj, policyID).Approvals)
		kept := updatePolicy(t, g.proj, policyID, policyBody{"approvers": body["approvers"]})
		require.Equal(t, http.StatusOK, kept.status)
		require.Equal(t, 2, mustGetPolicy(t, g.proj, policyID).Approvals, "an update without approvals changed them")
		lowered := updatePolicy(t, g.proj, policyID, policyBody{"approvers": body["approvers"], "approvals": 1})
		require.Equal(t, http.StatusOK, lowered.status)
		require.Equal(t, 1, mustGetPolicy(t, g.proj, policyID).Approvals)
	})

	t.Run("should refuse a project member without permission to manage policies", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)

		// Action
		res := createPolicyAs(t, g.requester, policyFor(g.proj, guardedPath, userApprover(g.approver)))

		// Assert
		require.Equalf(t, http.StatusForbidden, res.status, "the requester created a policy: %s", apierr.Body(res.body))
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should accept a policy when the plan does not include secret approvals", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[LICENSE] Today access approval policies have no entitlement check at all, unlike secret
			change policies. A later license clean-up changes this claim.`)

		// Setup
		tn := harness.From(t).NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.SecretApproval)))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		approver := proj.NewUser(t, fixture.WithPrincipalName("approver"))

		// Action
		res := createPolicyAs(t, tn.Admin, policyFor(proj, "/", userApprover(approver)))

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "creating returned %s", apierr.Body(res.body))
		require.Len(t, policyIDs(t, proj), 1)
	})
}

func TestAccessApprovalPolicy_Update(t *testing.T) {
	t.Parallel()

	t.Run("should save the new name, path and self-approval setting", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{
			"name":                 "renamed",
			"secretPath":           "/moved",
			"allowedSelfApprovals": false,
			"approvers":            subjects([]approver{userApprover(g.approver)}),
		})

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "updating returned %s", apierr.Body(res.body))
		policy := mustGetPolicy(t, g.proj, g.policyID)
		require.Equal(t, "renamed", policy.Name)
		require.Equal(t, "/moved", policy.SecretPath)
		require.False(t, policy.AllowedSelfApprovals)
		require.Len(t, policy.Environments, 1)
		require.Equal(t, "dev", policy.Environments[0].Slug)
	})

	t.Run("should refuse a group approver that is not in the project and keep the old approvers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		outsiders := fixture.NewGroup(t, g.tn)

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{"approvers": subjects([]approver{groupApprover(outsiders)})})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "Some groups are not members of the project: "+outsiders.ID.String(), res.message(t))
		approvers := mustGetPolicy(t, g.proj, g.policyID).Approvers
		require.Len(t, approvers, 1)
		require.Equal(t, g.approver.ID.String(), approvers[0].ID)
	})

	t.Run("should refuse moving the policy onto a path another policy covers and keep its path", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		newPolicy(t, g.proj, policyFor(g.proj, "/other", userApprover(g.approver)))

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{
			"secretPath": "/other",
			"approvers":  subjects([]approver{userApprover(g.approver)}),
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Equal(t, "A policy for secret path '/other' already exists in environment 'dev'", res.message(t))
		require.Equal(t, guardedPath, mustGetPolicy(t, g.proj, g.policyID).SecretPath)
	})

	t.Run("should accept the policy's own path sent again", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{
			"secretPath": guardedPath,
			"approvers":  subjects([]approver{userApprover(g.approver)}),
		})

		// Assert
		require.Equalf(t, http.StatusOK, res.status, "updating returned %s", apierr.Body(res.body))
		require.Equal(t, guardedPath, mustGetPolicy(t, g.proj, g.policyID).SecretPath)
	})

	t.Run("should take approvals for the first step when an update drops approvalsRequired", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		second := g.proj.NewUser(t, fixture.WithPrincipalName("second"))
		both := subjects([]approver{userApprover(g.approver), userApprover(second)})
		withEntry := updatePolicy(t, g.proj, g.policyID, policyBody{
			"approvers":         both,
			"approvals":         2,
			"approvalsRequired": []map[string]int{{"stepNumber": 1, "numberOfApprovals": 2}},
		})
		require.Equal(t, http.StatusOK, withEntry.status)
		require.Equal(t, []int{2, 2}, approvalsRequired(mustGetPolicy(t, g.proj, g.policyID)))

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{"approvers": both, "approvals": 1})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		require.Equal(t, []int{1, 1}, approvalsRequired(mustGetPolicy(t, g.proj, g.policyID)))
	})

	t.Run("should refuse an update into a step with too few approvers and leave the policy as it was", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{
			"approvers":         subjects([]approver{userApprover(g.approver)}),
			"approvals":         2,
			"approvalsRequired": []map[string]int{{"stepNumber": 1, "numberOfApprovals": 2}},
		})

		// Assert
		require.Equal(t, http.StatusBadRequest, res.status)
		require.Contains(t, res.message(t), "Step 1 requires 2 approvals but only has 1 approver")
		require.Equal(t, []int{1}, approvalsRequired(mustGetPolicy(t, g.proj, g.policyID)))
	})

	t.Run("should keep the maximum time period when an update leaves it out", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, func(b policyBody) { b["maxTimePeriod"] = "1h" })

		// Action
		res := updatePolicy(t, g.proj, g.policyID, policyBody{
			"name":      "renamed",
			"approvers": subjects([]approver{userApprover(g.approver)}),
		})

		// Assert
		require.Equal(t, http.StatusOK, res.status)
		policy := mustGetPolicy(t, g.proj, g.policyID)
		require.NotNil(t, policy.MaxTimePeriod)
		require.Equal(t, "1h", *policy.MaxTimePeriod)
	})
}

func TestAccessApprovalPolicy_Get(t *testing.T) {
	t.Parallel()

	t.Run("should carry the names of its approvers and bypassers", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t, func(b policyBody) {
			b["bypassers"] = []map[string]any{{"type": "user", "id": b["approvers"].([]map[string]any)[0]["id"]}}
		})

		// Action
		policy := mustGetPolicy(t, g.proj, g.policyID)

		// Assert
		require.Equal(t, guardedPath, policy.SecretPath)
		require.Equal(t, []policySubject{{
			Type: "user", ID: g.approver.ID.String(), Name: g.approver.Email, Sequence: 1, ApprovalsRequired: 1,
		}}, policy.Approvers)
		require.Equal(t, []policySubject{{Type: "user", ID: g.approver.ID.String(), Name: g.approver.Email}}, policy.Bypassers)
	})
}

func TestAccessApprovalPolicy_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should stop listing and serving the policy once it is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)

		// Action
		res, err := g.tn.Admin.API.DeleteAccessApprovalPolicyWithResponse(t.Context(), g.policyID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		_, status := getPolicy(t, g.proj, g.policyID)
		require.Equal(t, http.StatusNotFound, status)
		require.Empty(t, policyIDs(t, g.proj))
	})

	t.Run("should revoke approved grants and keep every request listed once its policy is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newGuarded(t)
		approvedID := openRequest(t, g.requester, g.proj, guardedPath, temporary("1h"))
		approve(t, g.approver, approvedID)
		awaitRead(t, g.requester, g.proj, true)
		pendingID := openRequest(t, g.requester, g.proj, guardedPath, nil)

		// Action
		res, err := g.tn.Admin.API.DeleteAccessApprovalPolicyWithResponse(t.Context(), g.policyID)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, res.StatusCode())
		approved, pending := requestByID(t, g.proj, approvedID), requestByID(t, g.proj, pendingID)
		require.Equal(t, "revoked", approved.Status)
		require.Nil(t, approved.Privilege)
		require.Nil(t, approved.PolicyID)
		require.NotNil(t, approved.Policy.DeletedAt)
		require.Equal(t, guardedPath, approved.Policy.SecretPath)
		require.Equal(t, "pending", pending.Status)
		require.NotNil(t, pending.Policy.DeletedAt)
		review := reviewAs(t, g.approver, pendingID, "approved")
		require.Equal(t, http.StatusBadRequest, review.status)
		require.Equal(t, "The policy associated with this access request has been deleted.", review.message(t))
		awaitRead(t, g.requester, g.proj, false)
	})

	t.Run("should refuse deleting an environment the policy covers until the policy is gone", func(t *testing.T) {
		t.Parallel()

		// Setup
		g := newProject(t)
		created, err := g.tn.Admin.API.CreateEnvironmentWithResponse(t.Context(), g.proj.ID,
			api.CreateEnvironmentJSONRequestBody{Name: "qa", Slug: "qa"})
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating the environment returned %s", apierr.Body(created.Body))
		envID := created.JSON200.Environment.Id.String()
		body := policyFor(g.proj, guardedPath, userApprover(g.approver))
		body["environment"] = "qa"
		policyID := newPolicy(t, g.proj, body)
		hard := &api.DeleteEnvironmentParams{HardDelete: new(api.DeleteEnvironmentParamsHardDelete("true"))}

		// Action
		blocked, err := g.tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), g.proj.ID, envID, hard)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, blocked.StatusCode())
		require.Equal(t, "Environment is in use by an access approval policy", reply{blocked.StatusCode(), blocked.Body}.message(t))
		require.Equal(t, []string{policyID}, policyIDs(t, g.proj))
		deleted, err := g.tn.Admin.API.DeleteAccessApprovalPolicyWithResponse(t.Context(), policyID)
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, deleted.StatusCode())
		removed, err := g.tn.Admin.API.DeleteEnvironmentWithResponse(t.Context(), g.proj.ID, envID, hard)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, removed.StatusCode(), "deleting the environment returned %s", apierr.Body(removed.Body))
	})

	t.Run("should delete a folder the policy covers and keep the policy on its path", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Today only secret change policies block a folder delete. An access policy matches
			by path, not by folder, so it outlives the folder and guards a folder made again at the path.`)

		// Setup
		g := newGuarded(t)
		folderID := secretmanager.FolderID(t, g.proj, "dev", "/", guardedPath[1:])

		// Action
		res, err := g.tn.Admin.API.DeleteSecretFolderWithResponse(t.Context(), folderID, api.DeleteSecretFolderJSONRequestBody{
			ProjectId: g.proj.ID, Environment: "dev", Path: new("/"), ForceDelete: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the folder returned %s", apierr.Body(res.Body))
		require.Equal(t, []string{g.policyID}, policyIDs(t, g.proj))
		policy, status := getPolicy(t, g.proj, g.policyID)
		require.Equal(t, http.StatusOK, status)
		require.Equal(t, guardedPath, policy.SecretPath)
	})
}
