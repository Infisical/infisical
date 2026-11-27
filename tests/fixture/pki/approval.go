package pki

import (
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Approver is a user or group named as an approver on an approval policy.
type Approver struct {
	ID   uuid.UUID
	Type api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversType
}

// UserApprover names a user as an approver.
func UserApprover(id uuid.UUID) Approver {
	return Approver{ID: id, Type: api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversTypeUser}
}

// GroupApprover names a group as an approver.
func GroupApprover(id uuid.UUID) Approver {
	return Approver{ID: id, Type: api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversTypeGroup}
}

// ApprovalStep is one step of an approval policy: RequiredApprovals of the approvers,
// who must be members of the application, have to approve before the next step starts.
type ApprovalStep struct {
	RequiredApprovals int
	Approvers         []Approver
}

// NewApprovalPolicy holds every request on the application's profile for one approval
// from any of the approvers, who must be members of the application, and returns the
// policy's id.
func NewApprovalPolicy(tt *testing.T, app Application, profile Profile, approvers ...Approver) uuid.UUID {
	tt.Helper()
	return NewStepsApprovalPolicy(tt, app, profile, ApprovalStep{RequiredApprovals: 1, Approvers: approvers})
}

// NewStepsApprovalPolicy holds every request on the application's profile until each
// step is approved in turn, and returns the policy's id.
func NewStepsApprovalPolicy(tt *testing.T, app Application, profile Profile, steps ...ApprovalStep) uuid.UUID {
	tt.Helper()
	body := api.CreateCertRequestApprovalPolicyJSONRequestBody{
		Name:    "policy-" + id.Short(),
		Scope:   api.CreateCertRequestApprovalPolicyJSONBodyScopePkiApplication,
		ScopeId: app.ID,
		Conditions: []struct {
			ProfileNames []string `json:"profileNames"`
		}{{ProfileNames: []string{profile.Slug}}},
	}
	for _, step := range steps {
		body.Steps = append(body.Steps, struct {
			Approvers []struct {
				Id   uuid.UUID                                                     `json:"id"`
				Type api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversType `json:"type"`
			} `json:"approvers"`
			Name              *string `json:"name,omitempty"`
			NotifyApprovers   *bool   `json:"notifyApprovers,omitempty"`
			RequiredApprovals float32 `json:"requiredApprovals"`
		}{RequiredApprovals: float32(step.RequiredApprovals)})
		last := &body.Steps[len(body.Steps)-1]
		for _, a := range step.Approvers {
			last.Approvers = append(last.Approvers, struct {
				Id   uuid.UUID                                                     `json:"id"`
				Type api.CreateCertRequestApprovalPolicyJSONBodyStepsApproversType `json:"type"`
			}{Id: a.ID, Type: a.Type})
		}
	}
	res, err := app.project.tn.Admin.API.CreateCertRequestApprovalPolicyWithResponse(tt.Context(), body)
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "creating the approval policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Policy.Id
}

// ApprovalFor is the approval request holding a certificate request made through the
// application, as the tenant admin lists them.
func ApprovalFor(tt *testing.T, app Application, certificateRequestID string) uuid.UUID {
	tt.Helper()
	res, err := app.project.tn.Admin.API.ListCertRequestApprovalRequestsWithResponse(tt.Context(), &api.ListCertRequestApprovalRequestsParams{
		Scope: api.ListCertRequestApprovalRequestsParamsScopePkiApplication,
		Id:    app.ID,
	})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "listing approval requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
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
	require.NoError(tt, json.Unmarshal(res.Body, &out))
	for _, r := range out.Requests {
		if r.RequestData.RequestData.CertificateRequestID == certificateRequestID {
			return r.ID
		}
	}
	require.Failf(tt, "no approval request", "none holds certificate request %s: %s", certificateRequestID, apierr.Body(res.Body))
	return uuid.Nil
}
