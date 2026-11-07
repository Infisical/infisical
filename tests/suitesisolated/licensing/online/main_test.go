// Package online_test covers an instance booted with an online self-hosted license
// key, which it exchanges at the License Server for its entitlements.
package online_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// licenseKey scopes this instance's state in the fake. It carries the binary's prefix
// so the fake's events reach this package.
var licenseKey = id.Nonce()

func TestMain(m *testing.M) {
	opts := []harness.Option{}
	for k, v := range license.SelfHostedEnv(licenseKey) {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
