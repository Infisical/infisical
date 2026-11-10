package license

import (
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
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

// SelfHostedScopes opens every scope a self-hosted instance reaches the License Server
// under: its license key (skipped when empty), the "self-hosted" organization its usage
// reports name, and the instance-wide endpoints. None of them is the tenant's org id.
func SelfHostedScopes(tt *testing.T, adminURL, licenseKey string) []*fakenet.Scope[State] {
	tt.Helper()
	keys := []string{"self-hosted", "instance"}
	if licenseKey != "" {
		keys = append(keys, licenseKey)
	}
	scopes := make([]*fakenet.Scope[State], 0, len(keys))
	for _, key := range keys {
		scopes = append(scopes, Open(tt, adminURL, key))
	}
	return scopes
}

// ExpectNothingSent fails if any of the scopes received a call. It first waits past the
// five second usage report debounce, so a report queued by the action has been sent.
func ExpectNothingSent(tt *testing.T, scopes []*fakenet.Scope[State]) {
	tt.Helper()
	scopes[0].ExpectNoEvent[SnapshotReceived](tt, nil, fakenet.Within(10*time.Second))
	for _, sc := range scopes {
		require.Empty(tt, sc.Calls(tt))
	}
}
