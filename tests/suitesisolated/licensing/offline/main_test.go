// Package offline_test covers an instance booted with a valid offline license, signed
// by a key the test generates and trusts in place of Infisical's own.
package offline_test

import (
	"fmt"
	"os"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
)

const licenseID = "harness-offline"

func TestMain(m *testing.M) {
	signer, err := license.NewSigner()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	key, err := signer.Key(license.V2(licenseID, license.Enterprise().Without(license.SecretRotation)))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	opts := []harness.Option{harness.WithInfisicalFile(signer.PublicKeyFile, license.PublicKeyPath)}
	for k, v := range license.SelfHostedEnv(key) {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
