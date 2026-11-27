package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestCertificateApproval_Steps(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should keep the request pending on the second step with no certificate once the first step approves", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newTwoStep(t, tn)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)

		// Action
		res, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "approving: %s", apierr.Body(res.Body))
		pending := g.approvalRequest(t, approval).JSON200.Request
		require.Equal(t, "pending", pending.Status)
		require.EqualValues(t, 2, pending.CurrentStep)
		held := g.certificateRequest(t, reqID).JSON200
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, held.Status)
		require.Nil(t, held.CertificateId)
	})

	t.Run("should issue the requested certificate once both steps approve", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newTwoStep(t, tn)
		name := id.Short() + ".approval.test"
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(name))
		require.NotNilf(t, res.JSON200, "requesting a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		reqID := res.JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)
		first, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, first.StatusCode(), "approving the first step: %s", apierr.Body(first.Body))

		// Action
		second, err := g.second.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, second.StatusCode(), "approving the second step: %s", apierr.Body(second.Body))
		require.Equal(t, "approved", g.approvalRequest(t, approval).JSON200.Request.Status)
		issued := g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusIssued)
		require.NotNil(t, issued.JSON200.Certificate)
		require.Equal(t, name, pki.ParseLeaf(t, *issued.JSON200.Certificate).Subject.CommonName)
	})

	t.Run("should refuse a second-step approver approving the first step and keep the request on it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newTwoStep(t, tn)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)

		// Action
		res, err := g.second.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not an eligible approver for this step", apierr.Message(res.Body))
		require.EqualValues(t, 1, g.approvalRequest(t, approval).JSON200.Request.CurrentStep)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, g.certificateRequest(t, reqID).JSON200.Status)
		first, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, first.StatusCode(), "the first-step approver approving afterwards: %s", apierr.Body(first.Body))
	})

	t.Run("should refuse a second-step approver rejecting the first step and keep the request on it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newTwoStep(t, tn)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)

		// Action
		res, err := g.second.API.RejectCertRequestApprovalRequestWithResponse(t.Context(), approval, api.RejectCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not an eligible approver for this step", apierr.Message(res.Body))
		pending := g.approvalRequest(t, approval).JSON200.Request
		require.Equal(t, "pending", pending.Status)
		require.EqualValues(t, 1, pending.CurrentStep)
		require.Empty(t, pending.Steps[0].Approvals)
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, g.certificateRequest(t, reqID).JSON200.Status)
		first, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, first.StatusCode(), "the first-step approver approving afterwards: %s", apierr.Body(first.Body))
	})

	t.Run("should hold a step that needs two approvals after one and issue once both approvers approve", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newTwoOfTwo(t, tn)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := pki.ApprovalFor(t, g.App, reqID)
		approve := func(approver *harness.Principal) *api.ApproveCertRequestApprovalRequestResponse {
			res, err := approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})
			require.NoError(t, err)
			return res
		}

		// Action
		first := approve(g.approver)

		// Assert
		require.Equalf(t, http.StatusOK, first.StatusCode(), "approving as the first approver: %s", apierr.Body(first.Body))
		pending := g.approvalRequest(t, approval).JSON200.Request
		require.Equal(t, "pending", pending.Status)
		require.EqualValues(t, 1, pending.CurrentStep)
		require.Len(t, pending.Steps, 1)
		require.Equal(t, "in-progress", pending.Steps[0].Status)
		require.Len(t, pending.Steps[0].Approvals, 1)
		held := g.certificateRequest(t, reqID).JSON200
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, held.Status)
		require.Nil(t, held.CertificateId)
		again := approve(g.approver)
		require.Equal(t, http.StatusBadRequest, again.StatusCode())
		require.Equal(t, "You have already approved this request", apierr.Message(again.Body))
		repeated := g.approvalRequest(t, approval).JSON200.Request
		require.Equal(t, "pending", repeated.Status)
		require.Equal(t, pending.Steps, repeated.Steps)
		second := approve(g.second)
		require.Equalf(t, http.StatusOK, second.StatusCode(), "approving as the second approver: %s", apierr.Body(second.Body))
		approved := g.approvalRequest(t, approval).JSON200.Request
		require.Equal(t, "approved", approved.Status)
		require.Equal(t, "completed", approved.Steps[0].Status)
		require.Len(t, approved.Steps[0].Approvals, 2)
		issued := g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusIssued)
		require.NotNil(t, issued.JSON200.Certificate)
	})
}
