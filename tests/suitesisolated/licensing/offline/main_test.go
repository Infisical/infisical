// Package offline_test boots with a valid offline license signed by a test key we
// trust in place of Infisical's.
package offline_test

import (
	"fmt"
	"os"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
)

const licenseID = "harness-offline"

var licenseKey string

func TestMain(m *testing.M) {
	signer, err := license.NewSigner()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	licenseKey, err = signer.Key(license.V2(licenseID, license.Enterprise().Without(license.SecretRotation)))
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	opts := []harness.Option{harness.WithInfisicalFile(signer.PublicKeyFile, license.PublicKeyPath)}
	for k, v := range license.SelfHostedEnv(licenseKey) {
		opts = append(opts, harness.WithInfisicalEnv(k, v))
	}
	harness.Main(m, harness.Isolated, opts...)
}
