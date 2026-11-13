// Package online_test boots with an online self-hosted license key.
package online_test

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
