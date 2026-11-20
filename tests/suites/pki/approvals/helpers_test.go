package approvals_test

import (
	"encoding/json"
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
	approver := tn.NewUser(t, harness.WithName("approver"))
	g.Project.Grant(t, approver)
	pki.AddMember(t, g.App, approver, "admin")
	approvers := []pki.Approver{pki.UserApprover(approver.ID)}
	if set == requesterAlsoApproves {
		approvers = append(approvers, pki.UserApprover(g.Operator.ID))
	}
	return gated{Graph: g, tn: tn, approver: approver, policyID: pki.NewApprovalPolicy(t, g.App, g.Profile, approvers...)}
}

// request asks for a certificate as the operator and returns the certificate request.
func (g gated) request(t *testing.T) *api.CreateCertificateResponse {
	t.Helper()
	res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".approval.test"))
	require.NotNilf(t, res.JSON200, "requesting a certificate returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

// approvalFor is the approval request holding a certificate request.
func (g gated) approvalFor(t *testing.T, certificateRequestID string) uuid.UUID {
	t.Helper()
	res, err := g.tn.Admin.API.ListCertRequestApprovalRequestsWithResponse(t.Context(), &api.ListCertRequestApprovalRequestsParams{
		Scope: api.ListCertRequestApprovalRequestsParamsScopePkiApplication,
		Id:    g.App.ID,
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing approval requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	var out struct {
		Requests []struct {
			ID          uuid.UUID `json:"id"`
			RequestData struct {
				RequestData struct {
					CertificateRequestID string `json:"certificateRequestId"`
				} `json:"requestData"`
			} `json:"requestData"`
		} `json:"requests"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	for _, r := range out.Requests {
		if r.RequestData.RequestData.CertificateRequestID == certificateRequestID {
			return r.ID
		}
	}
	require.Failf(t, "no approval request", "none holds certificate request %s: %s", certificateRequestID, apierr.Body(res.Body))
	return uuid.Nil
}

// approvalStatus is the approval request's own status, as the tenant admin reads it.
func (g gated) approvalStatus(t *testing.T, approvalID uuid.UUID) string {
	t.Helper()
	res, err := g.tn.Admin.API.GetCertRequestApprovalRequestWithResponse(t.Context(), approvalID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the approval request returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Request.Status
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
