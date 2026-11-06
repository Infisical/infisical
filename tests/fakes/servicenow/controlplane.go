package servicenow

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of one ServiceNow instance inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Instance]
}

// Open returns the instance an integration user addresses.
func Open(tt *testing.T, adminURL, username string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Instance](tt, adminURL, Service.Host(), username)}
}

// AccessRequest is the record Infisical created for an approval request. Nil until the
// request has been sent.
func (cp *ControlPlane) AccessRequest(tt *testing.T, requestID string) *AccessRequest {
	tt.Helper()
	for _, rec := range cp.State(tt).AccessRequests {
		if rec.RequestID == requestID {
			return rec
		}
	}
	return nil
}

// Approved records an approver approving a record as it was sent.
func Approved(sysID string) any {
	return Instance{AccessRequests: map[string]*AccessRequest{sysID: {Decision: "approved"}}}
}

// Rejected records an approver rejecting a record.
func Rejected(sysID, notes string) any {
	return Instance{AccessRequests: map[string]*AccessRequest{sysID: {Decision: "rejected", DecisionNotes: notes}}}
}

// Expired records the customer's flow closing a record before anyone decided it, which
// the application does not stamp a decision for.
func Expired(sysID string) any {
	return Instance{AccessRequests: map[string]*AccessRequest{sysID: {State: "expired"}}}
}
