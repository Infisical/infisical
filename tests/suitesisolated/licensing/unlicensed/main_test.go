// Package unlicensed_test covers an instance booted with no license at all: no
// License Server service key and no license key.
package unlicensed_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) {
	opts := []harness.Option{}
	for k, v := range license.SelfHostedEnv("") {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
