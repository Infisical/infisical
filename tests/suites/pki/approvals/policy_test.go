package approvals_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCertificateApprovalPolicy_Manage(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the application's approval policies", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)

		// Action
		res, err := tn.Admin.API.ListCertRequestApprovalPoliciesWithResponse(t.Context(), &api.ListCertRequestApprovalPoliciesParams{
			Scope: api.ListCertRequestApprovalPoliciesParamsScopePkiApplication,
			Id:    g.App.ID,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing approval policies returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []uuid.UUID
		for _, p := range res.JSON200.Policies {
			ids = append(ids, p.Id)
		}
		require.Equal(t, []uuid.UUID{g.policyID}, ids)
	})

	t.Run("should store a policy's new name and read it back", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)

		// Action
		res, err := tn.Admin.API.UpdateCertRequestApprovalPolicyWithResponse(t.Context(), g.policyID, api.UpdateCertRequestApprovalPolicyJSONRequestBody{
			Name: new("renamed-policy"),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "updating the approval policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCertRequestApprovalPolicyWithResponse(t.Context(), g.policyID)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the approval policy returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.Equal(t, "renamed-policy", got.JSON200.Policy.Name)
	})

	t.Run("should stop holding requests once the policy is deleted", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Reading a deleted policy answers 403 with "Policy not found" rather than
			404, the status every other missing resource gets.`)

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)

		// Action
		res, err := tn.Admin.API.DeleteCertRequestApprovalPolicyWithResponse(t.Context(), g.policyID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the approval policy: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCertRequestApprovalPolicyWithResponse(t.Context(), g.policyID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, got.StatusCode(), "reading the deleted policy: %s", apierr.Body(got.Body))
		require.Equal(t, "Policy not found", apierr.Message(got.Body))
		issued := g.request(t)
		require.Equal(t, api.CreateCertificate200JSONResponseBodyStatusIssued, *issued.JSON200.Status)
		require.NotNil(t, issued.JSON200.Certificate)
	})
}

func TestCertificateApproval_BreakGlass(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse breaking glass on a certificate request and keep it pending", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Certificate request policies refuse soft enforcement and bypassers on create
			("Bypassing approval is not supported for cert-request policies"), so every one is hard
			and the shared break-glass route can never issue a certificate request.`)

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)

		// Action
		res, err := g.Operator.API.BreakGlassCertRequestApprovalRequestWithResponse(t.Context(), approval, api.BreakGlassCertRequestApprovalRequestJSONRequestBody{
			BypassReason: "production outage needs a certificate now",
		})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "breaking glass: %s", apierr.Body(res.Body))
		require.Equal(t, "Bypassing approval is not supported for cert-request requests", apierr.Message(res.Body))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, g.certificateRequest(t, reqID).JSON200.Status)
		got, err := tn.Admin.API.GetCertRequestApprovalRequestWithResponse(t.Context(), approval)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the approval request returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.False(t, got.JSON200.Request.IsBreakGlass != nil && *got.JSON200.Request.IsBreakGlass)
	})
}

func TestCertificateApprovalPolicy_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a step needing more approvals than it has approvers and create no policy", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Such a step can never complete, so every request the policy matches is held for
			good. Revocation and secret access policies already refuse it with this message.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		approver := pki.NewMember(t, g.App, "approver", "admin")
		var body api.CreateCertRequestApprovalPolicyJSONRequestBody
		require.NoError(t, json.Unmarshal(fmt.Appendf(nil, `{
			"name": "policy-%s", "scope": "pki-application", "scopeId": %q,
			"conditions": [{"profileNames": [%q]}],
			"steps": [{"requiredApprovals": 2, "approvers": [{"type": "user", "id": %q}]}]
		}`, id.Short(), g.App.ID, g.Profile.Slug, approver.ID), &body))

		// Action
		res, err := tn.Admin.API.CreateCertRequestApprovalPolicyWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "creating the policy: %s", apierr.Body(res.Body))
		require.Equal(t, "Step 1 requires 2 approvals but only has 1 approver. Add approvers to the step or lower its required approvals.", apierr.Message(res.Body))
		list, err := tn.Admin.API.ListCertRequestApprovalPoliciesWithResponse(t.Context(), &api.ListCertRequestApprovalPoliciesParams{
			Scope: api.ListCertRequestApprovalPoliciesParamsScopePkiApplication,
			Id:    g.App.ID,
		})
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing approval policies returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		require.Empty(t, list.JSON200.Policies)
	})
}
