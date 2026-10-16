// Package servicenow fakes the parts of a ServiceNow instance's REST API that Infisical
// calls.
//
// One fake for the service, not one per feature. The App Connection and delegated
// approval both reach the same instance as the same integration user.
package servicenow

import (
	"net/http"
	"sync"
)

// Instance is one ServiceNow instance as one integration user sees it, addressed by
// the username a test invented.
type Instance struct {
	UserSysID string `json:"userSysId"`

	mu  sync.Mutex
	mux *http.ServeMux
}
