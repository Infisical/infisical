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

// SelfHostedEnv boots an instance on a self-hosted license instead of Cloud: no
// service key, and the given license key. Pass "" for an instance with no license.
//
// An online key is exchanged at the fake for a token, so it scopes the fake's state
// and must start with the binary's prefix (id.Nonce) for its events to reach the
// test. An offline key never reaches the fake.
func SelfHostedEnv(licenseKey string) map[string]string {
	return map[string]string{
		"LICENSE_SERVER_V2_SERVICE_KEY": "",
		"LICENSE_SERVER_URL":            "https://" + Host,
		"LICENSE_KEY":                   licenseKey,
	}
}

// Open returns a handle on one organization's License Server state, and starts
// collecting its events.
//
// Stub on the ROOT organization id: fetchAndCacheCloudPlan resolves
// findRootOrgDetails and sends the root organization to the license server, so a
// sub-org resolves its parent's plan. For a self-hosted instance the scope is the
// license key.
func Open(tt *testing.T, adminURL, scope string) *fakenet.Scope[State] {
	tt.Helper()
	fakenet.Track(tt, adminURL, Host, scope)
	return fakenet.Open[State](tt, adminURL, Host, scope)
}
