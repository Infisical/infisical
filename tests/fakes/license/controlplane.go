package license

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// Env is what the instance needs to reach the fake instead of the real License
// Server.
//
// Setting the service key at all is what makes isCloud true, and Cloud is the only
// instance type whose getPlan resolves per organization. Every other type
// short-circuits to one instance-wide feature set, which would make per-tenant
// entitlements impossible.
func Env() map[string]string {
	return map[string]string{
		"LICENSE_SERVER_V2_SERVICE_KEY": serviceKey(),
		"LICENSE_SERVER_URL":            "https://" + Host,
	}
}

// Open returns a handle on one organization's entitlements.
//
// Stub on the ROOT organization id: fetchAndCacheCloudPlan resolves
// findRootOrgDetails and sends the root organization to the license server, so a
// sub-org resolves its parent's plan.
func Open(tt *testing.T, adminURL, rootOrgID string) *fakenet.Scope[Plan] {
	tt.Helper()
	return fakenet.Open[Plan](tt, adminURL, Host, rootOrgID)
}
