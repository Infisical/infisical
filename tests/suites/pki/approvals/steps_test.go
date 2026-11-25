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
}
