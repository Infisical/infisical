package scep_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Pending(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer PENDING and issue nothing while the enrollment waits for approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		e := newHeldEnrollment(t, tn)

		// Action
		got := e.p.poll(t, e.req, e.signer)

		// Assert
		require.Equal(t, scep.PENDING, got.status)
		require.Empty(t, e.p.certificates(t))
	})

	t.Run("should deliver the approved request's certificate for the CSR's key when the device polls", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		e := newHeldEnrollment(t, tn)
		approved, err := e.approver.API.ApproveCertRequestApprovalRequestWithResponse(t.Context(), pki.ApprovalFor(t, e.p.app, e.requestID), api.ApproveCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, approved.StatusCode(), "approving: %s", apierr.Body(approved.Body))
		issued := pki.WaitRequest(t, tn.Admin, e.requestID, []api.GetCertificateRequest200JSONResponseBodyStatus{api.GetCertificateRequest200JSONResponseBodyStatusIssued})
		require.NotNil(t, issued.JSON200.Certificate)

		// Action
		got := e.p.poll(t, e.req, e.signer)

		// Assert
		require.Equalf(t, scep.SUCCESS, got.status, "polling failed: %s", got.failInfo)
		require.True(t, e.req.key.PublicKey.Equal(got.cert.PublicKey), "the certificate is not for the CSR's key")
		require.Equal(t, pki.ParseLeaf(t, *issued.JSON200.Certificate).Raw, got.cert.Raw)
	})

	t.Run("should answer FAILURE with no certificate when the device polls after a rejection", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		e := newHeldEnrollment(t, tn)
		res, err := e.approver.API.RejectCertRequestApprovalRequestWithResponse(t.Context(), pki.ApprovalFor(t, e.p.app, e.requestID), api.RejectCertRequestApprovalRequestJSONRequestBody{})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "rejecting: %s", apierr.Body(res.Body))
		pki.WaitRequest(t, tn.Admin, e.requestID, []api.GetCertificateRequest200JSONResponseBodyStatus{api.GetCertificateRequest200JSONResponseBodyStatusRejected})

		// Action
		got := e.p.poll(t, e.req, e.signer)

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
		require.Empty(t, e.p.certificates(t))
	})

	t.Run("should refuse with badCertId when the device polls a transaction it never started", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		signer := newDevice(t, "unknown-device.example.com")
		never := p.pkcsReq(t, signer, "unknown-device.example.com", "testpassword123")

		// Action
		got := p.poll(t, never, signer)

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadCertID, got.failInfo)
	})
}

// heldEnrollment is a PKCSReq the profile answered PENDING because an approval policy
// holds it, with the certificate request it made.
type heldEnrollment struct {
	p         scepProfile
	approver  *harness.Principal
	signer    device
	req       request
	requestID string
}

func newHeldEnrollment(t *testing.T, tn *harness.Tenant) heldEnrollment {
	t.Helper()
	p := newScepProfile(t, tn, staticChallenge("testpassword123"))
	approver := pki.NewMember(t, p.app, "app-admin", "admin")
	pki.NewApprovalPolicy(t, p.app, p.profile, pki.UserApprover(approver.ID))
	signer := newDevice(t, "held-device.example.com")
	req := p.pkcsReq(t, signer, "held-device.example.com", "testpassword123")
	got := readCertRep(t, p.post(t, req.msg.Raw), req, signer)
	require.Equalf(t, scep.PENDING, got.status, "the enrollment was not held: %s", got.failInfo)

	requests := pki.ProfileRequests(t, p.project, p.profile).JSON200.CertificateRequests
	require.Len(t, requests, 1)
	return heldEnrollment{p: p, approver: approver, signer: signer, req: req, requestID: requests[0].Id}
}
