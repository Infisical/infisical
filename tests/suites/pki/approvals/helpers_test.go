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

// newGated puts an approval policy on a graph's profile, approved by a new Product
// Member who administers the application, and also by the operator, who requests,
// when requesterApproves.
func newGated(t *testing.T, tn *harness.Tenant, requesterApproves bool) gated {
	t.Helper()
	g := pki.NewGraph(t, tn)
	approver := tn.NewUser(t, harness.WithName("approver"))
	g.Project.Grant(t, approver)
	pki.AddMember(t, g.App, approver, "admin")

	body := api.CreateCertRequestApprovalPolicyJSONRequestBody{
		Name:    "policy-" + id.Short(),
		Scope:   api.CreateCertRequestApprovalPolicyJSONBodyScopePkiApplication,
		ScopeId: g.App.ID,
		Conditions: []struct {
			ProfileNames []string `json:"profileNames"`
		}{{ProfileNames: []string{g.Profile.Slug}}},
	}
	body.Steps = []struct {
		Approvers []struct {
			Id   uuid.UUID                                                     `json:"id"`
			Type api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversType `json:"type"`
		} `json:"approvers"`
		Name              *string `json:"name,omitempty"`
		NotifyApprovers   *bool   `json:"notifyApprovers,omitempty"`
		RequiredApprovals float32 `json:"requiredApprovals"`
	}{{RequiredApprovals: 1}}
	approvers := []uuid.UUID{approver.ID}
	if requesterApproves {
		approvers = append(approvers, g.Operator.ID)
	}
	for _, a := range approvers {
		body.Steps[0].Approvers = append(body.Steps[0].Approvers, struct {
			Id   uuid.UUID                                                     `json:"id"`
			Type api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversType `json:"type"`
		}{Id: a, Type: api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversTypeUser})
	}
	res, err := tn.Admin.API.CreateCertRequestApprovalPolicyWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the approval policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return gated{Graph: g, tn: tn, approver: approver, policyID: res.JSON200.Policy.Id}
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
