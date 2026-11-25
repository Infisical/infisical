package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// policyApprovers is the ids of the approvers on the approval policy's steps.
func policyApprovers(t *testing.T, tn *harness.Tenant, policyID uuid.UUID) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.GetCertRequestApprovalPolicyWithResponse(t.Context(), policyID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the approval policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out []uuid.UUID
	for _, step := range res.JSON200.Policy.Steps {
		for _, a := range step.Approvers {
			out = append(out, a.Id)
		}
	}
	return out
}

func TestApplicationMembership_Role(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a user operator issuing once their role is changed to auditor", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationUserMemberRoleWithResponse(t.Context(), g.App.ID, g.Operator.ID, api.UpdatePkiApplicationUserMemberRoleJSONRequestBody{Role: "auditor"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))

		// Assert
		requireIssueRefused(t, g, g.Operator, cannotIssue)
	})

	t.Run("should let a user auditor issue once their role is changed to operator", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationUserMemberRoleWithResponse(t.Context(), g.App.ID, auditor.ID, api.UpdatePkiApplicationUserMemberRoleJSONRequestBody{Role: "operator"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))

		// Assert
		name := id.Short() + ".app.test"
		got := pki.Issue(t, g.App, g.Profile, pki.ServerCertificate(name), pki.As(auditor))
		require.Equal(t, []string{name}, pki.ParseLeaf(t, got.Certificate).DNSNames)
	})

	t.Run("should refuse an auditor promoting themselves to operator", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := auditor.API.UpdatePkiApplicationUserMemberRoleWithResponse(t.Context(), g.App.ID, auditor.ID, api.UpdatePkiApplicationUserMemberRoleJSONRequestBody{Role: "operator"})
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not allowed to edit on member", apierr.Message(res.Body))
		requireIssueRefused(t, g, auditor, cannotIssue)
	})

	t.Run("should drop a user from the application's approval policy once their role is changed to auditor", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		kept := member(t, tn, g, "admin")
		policyID := pki.NewApprovalPolicy(t, g.App, g.Profile, pki.UserApprover(g.Operator.ID), pki.UserApprover(kept.ID))

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationUserMemberRoleWithResponse(t.Context(), g.App.ID, g.Operator.ID, api.UpdatePkiApplicationUserMemberRoleJSONRequestBody{Role: "auditor"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))

		// Assert
		require.Equal(t, []uuid.UUID{kept.ID}, policyApprovers(t, tn, policyID))
	})

	t.Run("should refuse a machine identity operator issuing once its role is changed to auditor", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		mi := operatorIdentity(t, tn, g)

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationIdentityMemberRoleWithResponse(t.Context(), g.App.ID, mi.ID, api.UpdatePkiApplicationIdentityMemberRoleJSONRequestBody{Role: "auditor"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))

		// Assert
		requireIssueRefused(t, g, mi, cannotIssue)
	})

	t.Run("should refuse a group member issuing once the group's role is changed to auditor", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		user, groupID := operatorGroupMember(t, tn, g)

		// Action
		res, err := tn.Admin.API.UpdatePkiApplicationGroupMemberRoleWithResponse(t.Context(), g.App.ID, groupID, api.UpdatePkiApplicationGroupMemberRoleJSONRequestBody{Role: "auditor"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "changing the role: %s", apierr.Body(res.Body))

		// Assert
		requireIssueRefused(t, g, user, cannotIssue)
	})
}

func TestApplicationMembership_Remove(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a machine identity issuing once it is removed from the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		mi := operatorIdentity(t, tn, g)

		// Action
		res, err := tn.Admin.API.RemovePkiApplicationIdentityMemberWithResponse(t.Context(), g.App.ID, mi.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the identity: %s", apierr.Body(res.Body))

		// Assert
		requireIssueRefused(t, g, mi, notAMember)
	})

	t.Run("should refuse a group member issuing once the group is removed from the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		user, groupID := operatorGroupMember(t, tn, g)

		// Action
		res, err := tn.Admin.API.RemovePkiApplicationGroupMemberWithResponse(t.Context(), g.App.ID, groupID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the group: %s", apierr.Body(res.Body))

		// Assert
		requireIssueRefused(t, g, user, notAMember)
	})

	t.Run("should drop a group from the application's approval policy once it is removed from the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		_, groupID := operatorGroupMember(t, tn, g)
		kept := member(t, tn, g, "admin")
		policyID := pki.NewApprovalPolicy(t, g.App, g.Profile, pki.GroupApprover(groupID), pki.UserApprover(kept.ID))

		// Action
		res, err := tn.Admin.API.RemovePkiApplicationGroupMemberWithResponse(t.Context(), g.App.ID, groupID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the group: %s", apierr.Body(res.Body))

		// Assert
		require.Equal(t, []uuid.UUID{kept.ID}, policyApprovers(t, tn, policyID))
	})

	t.Run("should refuse an operator removing another member and leave that member able to issue", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		mi := operatorIdentity(t, tn, g)

		// Action
		res, err := g.Operator.API.RemovePkiApplicationIdentityMemberWithResponse(t.Context(), g.App.ID, mi.ID)
		require.NoError(t, err)

		// Assert
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "removing the identity: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not allowed to delete on member", apierr.Message(res.Body))
		pki.Issue(t, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"), pki.As(mi))
	})
}
