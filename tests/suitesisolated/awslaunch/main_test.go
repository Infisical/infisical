package awslaunch_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

const (
	trustedAccount = "123456789012"
	templateBase   = "https://mirror.test/cfn"
)

// Isolated: the Trusted account and template URL overrides are instance-wide environment.
func TestMain(m *testing.M) {
	harness.Main(m, harness.Isolated,
		harness.WithInfisicalEnv("INF_APP_CONNECTION_AWS_TRUSTED_ACCOUNT_ID", trustedAccount),
		harness.WithInfisicalEnv("INF_APP_CONNECTION_AWS_TEMPLATE_BASE_URL", templateBase))
}
