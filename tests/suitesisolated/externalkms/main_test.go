package externalkms_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// instanceKey is Infisical's own AWS credential, the one it assumes customers' roles
// with. The SDK's default credential chain reads it from the environment, which is
// instance-wide, so the package gets an instance of its own.
var instanceKey = id.Nonce()

func TestMain(m *testing.M) {
	harness.Main(m, harness.Isolated,
		harness.WithInfisicalEnv("AWS_ACCESS_KEY_ID", instanceKey),
		harness.WithInfisicalEnv("AWS_SECRET_ACCESS_KEY", aws.SecretAccessKey(instanceKey)))
}
