package approvals_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// gated is a graph whose application holds every request on its profile for one
// approval.
type gated struct {
	*pki.Graph
	tn       *harness.Tenant
	approver *harness.Principal
	policyID uuid.UUID
}

// approverSet says who approves on a gated graph's policy besides the approver.
type approverSet bool

const (
	// separateApproverOnly leaves the requesting operator off the approver list.
	separateApproverOnly approverSet = false
	// requesterAlsoApproves names the requesting operator as an approver too.
	requesterAlsoApproves approverSet = true
)

// newGated puts an approval policy on a graph's profile, approved by a new Product
// Member who administers the application, and by the requesting operator when the
// set says so.
func newGated(t *testing.T, tn *harness.Tenant, set approverSet) gated {
	t.Helper()
	g := pki.NewGraph(t, tn)
	approver := pki.NewMember(t, g.App, "approver", "admin")
	approvers := []pki.Approver{pki.UserApprover(approver.ID)}
	if set == requesterAlsoApproves {
		approvers = append(approvers, pki.UserApprover(g.Operator.ID))
	}
	return gated{Graph: g, tn: tn, approver: approver, policyID: pki.NewApprovalPolicy(t, g.App, g.Profile, approvers...)}
}

// twoApprovers is a gated graph with a second approver; its constructor decides how the
// policy's steps use the approver and the second approver.
type twoApprovers struct {
	gated
	second *harness.Principal
}

// newTwoStep needs the approver's approval and then, in a second step, the second
// approver's.
func newTwoStep(t *testing.T, tn *harness.Tenant) twoApprovers {
	t.Helper()
	return newTwoApprovers(t, tn, func(first, second pki.Approver) []pki.ApprovalStep {
		return []pki.ApprovalStep{
			{RequiredApprovals: 1, Approvers: []pki.Approver{first}},
			{RequiredApprovals: 1, Approvers: []pki.Approver{second}},
		}
	})
}

// newTwoOfTwo has one step that needs both the approver's and the second approver's
// approval.
func newTwoOfTwo(t *testing.T, tn *harness.Tenant) twoApprovers {
	t.Helper()
	return newTwoApprovers(t, tn, func(first, second pki.Approver) []pki.ApprovalStep {
		return []pki.ApprovalStep{{RequiredApprovals: 2, Approvers: []pki.Approver{first, second}}}
	})
}

func newTwoApprovers(t *testing.T, tn *harness.Tenant, steps func(first, second pki.Approver) []pki.ApprovalStep) twoApprovers {
	t.Helper()
	g := pki.NewGraph(t, tn)
	first, second := pki.NewMember(t, g.App, "first", "admin"), pki.NewMember(t, g.App, "second", "admin")
	policyID := pki.NewStepsApprovalPolicy(t, g.App, g.Profile, steps(pki.UserApprover(first.ID), pki.UserApprover(second.ID))...)
	return twoApprovers{gated: gated{Graph: g, tn: tn, approver: first, policyID: policyID}, second: second}
}

// request asks for a certificate as the operator and returns the certificate request.
func (g gated) request(t *testing.T) *api.CreateCertificateResponse {
	t.Helper()
	res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".approval.test"))
	require.NotNilf(t, res.JSON200, "requesting a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// approvalRequest is the approval request as the tenant admin reads it.
func (g gated) approvalRequest(t *testing.T, approvalID uuid.UUID) *api.GetCertRequestApprovalRequestResponse {
	t.Helper()
	res, err := g.tn.Admin.API.GetCertRequestApprovalRequestWithResponse(t.Context(), approvalID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the approval request returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// certificateRequest is the certificate request as the tenant admin reads it.
func (g gated) certificateRequest(t *testing.T, requestID string) *api.GetCertificateRequestResponse {
	t.Helper()
	reqID, err := uuid.Parse(requestID)
	require.NoError(t, err)
	res, err := g.tn.Admin.API.GetCertificateRequestWithResponse(t.Context(), reqID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the certificate request returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// waitStatus waits for the certificate request to reach a status.
func (g gated) waitStatus(t *testing.T, requestID string, want api.GetCertificateRequest200JSONResponseBodyStatus) *api.GetCertificateRequestResponse {
	t.Helper()
	return pki.WaitRequest(t, g.tn.Admin, requestID, []api.GetCertificateRequest200JSONResponseBodyStatus{want})
}
