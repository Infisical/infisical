package approvals_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestAccessApprovalPolicy_DelegatedApproval(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse to update a policy handled by a delegated approval system while it has a pending request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		requester := proj.NewUser(t, fixture.WithPrincipalName("requester"))
		conn := newDelegatedApprovalSystem(t, tn)
		policyID, name := newDelegatedAccessPolicy(t, proj, conn)
		requestAccess(t, requester, proj, "dev", "/")

		// Action
		res, err := tn.Admin.API.UpdateAccessApprovalPolicyWithBodyWithResponse(t.Context(), policyID.String(),
			"application/json", jsonBody(t, map[string]any{"name": "renamed", "allowedSelfApprovals": false}))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusConflict, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, errorMessage(t, res.Body),
			"has 1 pending request(s). Resolve or cancel them before updating the policy.")
		require.Equal(t, name, accessPolicyName(t, proj, policyID))
	})

	for _, tc := range []struct {
		managedBy string
		configure func(t *testing.T, proj *fixture.Project, body map[string]any)
		message   string
	}{
		{
			managedBy: "approvers",
			configure: func(t *testing.T, proj *fixture.Project, body map[string]any) {
				approver := proj.NewUser(t, fixture.WithPrincipalName("approver"))
				body["approvers"] = []map[string]any{{"type": "user", "id": approver.ID}}
			},
			message: "Policies handled by a delegated approval system cannot have approvers, since the delegated approval system reviews their requests. Remove the approvers.",
		},
		{
			managedBy: "bypassers",
			configure: func(t *testing.T, proj *fixture.Project, body map[string]any) {
				bypasser := proj.NewUser(t, fixture.WithPrincipalName("bypasser"))
				body["bypassers"] = []map[string]any{{"type": "user", "id": bypasser.ID}}
			},
			message: "Policies handled by a delegated approval system cannot have bypassers, since break glass is not available for them.",
		},
		{
			managedBy: "self approvals",
			configure: func(_ *testing.T, _ *fixture.Project, body map[string]any) {
				body["allowedSelfApprovals"] = true
			},
			message: "Policies handled by a delegated approval system cannot allow self approvals. Set allowedSelfApprovals to false.",
		},
		{
			managedBy: "soft enforcement",
			configure: func(_ *testing.T, _ *fixture.Project, body map[string]any) {
				body["enforcementLevel"] = "soft"
			},
			message: "Policies handled by a delegated approval system cannot use soft enforcement, since break glass is not available for them. Set enforcementLevel to 'hard'.",
		},
	} {
		t.Run("should refuse and create no policy when one handled by a delegated approval system also has "+tc.managedBy, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
			conn := newDelegatedApprovalSystem(t, tn)
			body := delegatedAccessPolicyBody(proj, conn)
			tc.configure(t, proj, body)

			// Action
			res, err := tn.Admin.API.CreateAccessApprovalPolicyWithBodyWithResponse(t.Context(), "application/json",
				jsonBody(t, body))

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "%s", apierr.Body(res.Body))
			require.Equal(t, tc.message, res.JSON400.Message)
			require.Zero(t, accessPolicyCount(t, proj))
		})
	}
}

// delegatedAccessPolicyBody hands dev:/ to a delegated approval system with nothing for
// Infisical to review itself, which is the only shape such a policy may take.
//
// A map rather than the typed body because delegatedApproval is generated as an
// anonymous struct, which a test cannot name without restating its tags.
func delegatedAccessPolicyBody(proj *fixture.Project, conn *fixture.AppConnection) map[string]any {
	return map[string]any{
		"projectSlug":          proj.Slug,
		"environment":          "dev",
		"secretPath":           "/",
		"enforcementLevel":     "hard",
		"allowedSelfApprovals": false,
		"delegatedApproval":    delegatedApproval(conn),
	}
}

func newDelegatedAccessPolicy(t *testing.T, proj *fixture.Project, conn *fixture.AppConnection) (uuid.UUID, string) {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateAccessApprovalPolicyWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, delegatedAccessPolicyBody(proj, conn)))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Approval.Id, res.JSON200.Approval.Name
}

// requestAccess fails unless the requester's ask to read a folder is left pending.
func requestAccess(t *testing.T, requester *harness.Principal, proj *fixture.Project, env, secretPath string) uuid.UUID {
	t.Helper()
	body := jsonBody(t, map[string]any{
		"permissions": []any{
			[]any{"read", "secrets", map[string]any{"environment": env, "secretPath": map[string]any{"$glob": secretPath}}},
		},
		"isTemporary": false,
	})
	res, err := requester.API.CreateAccessApprovalRequestWithBodyWithResponse(t.Context(),
		&api.CreateAccessApprovalRequestParams{ProjectSlug: proj.Slug}, "application/json", body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "requesting access returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Equal(t, new("pending"), res.JSON200.Approval.Status)
	return res.JSON200.Approval.Id
}

func accessPolicyName(t *testing.T, proj *fixture.Project, policyID uuid.UUID) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.GetAccessApprovalPolicyWithResponse(t.Context(), policyID.String())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Approval.Name
}

func accessPolicyCount(t *testing.T, proj *fixture.Project) int {
	t.Helper()
	res, err := proj.Tenant().Admin.API.ListAccessApprovalPoliciesWithResponse(t.Context(),
		&api.ListAccessApprovalPoliciesParams{ProjectSlug: proj.Slug})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing policies returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	if res.JSON200.Approvals == nil {
		return 0
	}
	return len(*res.JSON200.Approvals)
}

// errorMessage reads the message off an error the generated client has no type for.
func errorMessage(t *testing.T, body []byte) string {
	t.Helper()
	var reply struct {
		Message string `json:"message"`
	}
	require.NoErrorf(t, json.Unmarshal(body, &reply), "reading the error: %s", apierr.Body(body))
	return reply.Message
}
