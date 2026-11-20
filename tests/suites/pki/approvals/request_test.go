package approvals_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificateApproval_Request(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should hold a request under an approval policy as pending approval with no certificate", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)

		// Action
		res := g.request(t)

		// Assert
		require.Equal(t, api.CreateCertificate200JSONResponseBodyStatusPendingApproval, *res.JSON200.Status)
		require.Nil(t, res.JSON200.Certificate)
		require.Nil(t, g.certificateRequest(t, res.JSON200.CertificateRequestId).JSON200.CertificateId)
	})

	t.Run("should issue the certificate once an approver approves", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "approving: %s", apierr.Body(res.Body))
		issued := g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusIssued)
		require.NotNil(t, issued.JSON200.CertificateId)
	})

	t.Run("should reject the request and issue nothing once an approver rejects", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.approver.API.RejectCertRequestApprovalRequestWithResponse(t.Context(), approval, api.RejectCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "rejecting: %s", apierr.Body(res.Body))
		rejected := g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusRejected)
		require.Nil(t, rejected.JSON200.CertificateId)
	})

	t.Run("should refuse the requester approving their own request when they are not an approver and keep it pending", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, separateApproverOnly)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.Operator.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not an eligible approver for this step", apierr.Message(res.Body))
		require.Equal(t, api.GetCertificateRequest200JSONResponseBodyStatusPendingApproval, g.certificateRequest(t, reqID).JSON200.Status)
	})

	t.Run("should let a requester the policy lists as an approver approve their own request", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The certificate request approval guide allows an eligible requester to approve
			their own request by default; separation of duties is configured by leaving the
			requester off the approvers. Code signing refuses self-approval, but that is its own rule.`)

		// Setup
		tn := h.NewTenant(t)
		g := newGated(t, tn, requesterAlsoApproves)
		reqID := g.request(t).JSON200.CertificateRequestId
		approval := g.approvalFor(t, reqID)

		// Action
		res, err := g.Operator.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), approval, api.ApproveCertRequestApprovalRequestJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "approving: %s", apierr.Body(res.Body))
		g.waitStatus(t, reqID, api.GetCertificateRequest200JSONResponseBodyStatusIssued)
	})
}
