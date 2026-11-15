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

// SelfHostedEnv boots on a self-hosted license, "" for none. An online key scopes the
// fake's state, so it must come from id.Nonce or its events never reach the test.
// Offline keys never hit the fake.
func SelfHostedEnv(licenseKey string) map[string]string {
	return map[string]string{
		"LICENSE_SERVER_V2_SERVICE_KEY": "",
		"LICENSE_SERVER_URL":            "https://" + Host,
		"LICENSE_KEY":                   licenseKey,
	}
}

// Open returns a handle on one scope: the ROOT org id on cloud (the instance caches the
// plan per root org, so a sub-org resolves its parent's), the license key on self-hosted.
func Open(tt *testing.T, adminURL, scope string) *fakenet.Scope[State] {
	tt.Helper()
	fakenet.Track(tt, adminURL, Host, scope)
	return fakenet.Open[State](tt, adminURL, Host, scope)
}

// SelfHostedScopes covers every scope self-hosted can hit: the license key, the
// "self-hosted" org usage reports use, and the instance-wide endpoints. Never the
// tenant's org id.
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

// ExpectNothingSent waits out the 5s report debounce so a queued report would show up.
func ExpectNothingSent(tt *testing.T, scopes []*fakenet.Scope[State]) {
	tt.Helper()
	scopes[0].ExpectNoEvent[SnapshotReceived](tt, nil, fakenet.Within(10*time.Second))
	for _, sc := range scopes {
		require.Empty(tt, sc.Calls(tt))
	}
}
