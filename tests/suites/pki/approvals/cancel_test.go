package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestCertificateApproval_Cancel(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should end the request with no certificate and refuse a later approval once the requester cancels", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.Operator.API.CancelCertRequestApprovalRequestWithResponse(t.Context(), approval)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "cancelling: %s", apierr.Body(res.Body))

		// Assert
		ended := g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusRejected)
		require.Nil(t, ended.JSON200.CertificateId)
		require.Equal(t, "cancelled", g.approvalStatus(t, approval))
		late, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, late.StatusCode(), "approving answered: %s", apierr.Body(late.Body))
		require.Nil(t, g.certificateRequest(t, reqID).JSON200.CertificateId)
	})

	t.Run("should refuse an approver cancelling a request they did not make and keep it pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.approver.API.CancelCertRequestApprovalRequestWithResponse(t.Context(), approval)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "cancelling answered: %s", apierr.Body(res.Body))
		require.Equal(t, "You are not the requester of this request", apierr.Message(res.Body))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, g.certificateRequest(t, reqID).JSON200.Status)
		require.Equal(t, "pending", g.approvalStatus(t, approval))
	})
}
