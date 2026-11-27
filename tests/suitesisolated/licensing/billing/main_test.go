// Package billing_test covers the billing portal on a self-hosted instance with an online
// license, where it is a read-only view and an instance admin can read every organization.
package billing_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// Needs the binary's prefix or the fake's events never reach this package.
var licenseKey = id.Nonce()

func TestMain(m *testing.M) {
	opts := []harness.Option{}
	for k, v := range license.SelfHostedEnv(licenseKey) {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
