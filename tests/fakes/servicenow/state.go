// Package servicenow fakes the parts of a ServiceNow instance's REST API that Infisical
// calls.
//
// One fake for the service, not one per feature. The App Connection and delegated
// approval both reach the same instance as the same integration user.
package servicenow

import (
	"net/http"
	"sync"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Instance is one ServiceNow instance as one integration user sees it, addressed by
// the username a test invented.
type Instance struct {
	UserSysID      string                    `json:"userSysId"`
	AccessRequests map[string]*AccessRequest `json:"accessRequests"`

	mu     sync.Mutex
	mux    *http.ServeMux
	events fakenet.Emitter
}

// AccessRequest is a record of the Infisical Approvals application, keyed by its sys_id.
// Everything above Decision is what Infisical sent; Decision and DecisionNotes are what
// an approver records in ServiceNow, and stay empty until a test seeds them. State is
// what the customer's flow sets; left empty, it follows from Decision.
type AccessRequest struct {
	SysID          string   `json:"sysId"`
	RequestID      string   `json:"requestId"`
	CallbackURL    string   `json:"callbackUrl"`
	CallbackToken  string   `json:"callbackToken"`
	Environment    string   `json:"environment"`
	SecretPath     string   `json:"secretPath"`
	RequestorEmail string   `json:"requestorEmail"`
	Permissions    []string `json:"permissions"`

	Decision      string `json:"decision,omitempty"`
	DecisionNotes string `json:"decisionNotes,omitempty"`
	State         string `json:"state,omitempty"`
}

func (rec *AccessRequest) detail() AccessRequestDetail {
	return AccessRequestDetail{SysID: rec.SysID, RequestID: rec.RequestID}
}
