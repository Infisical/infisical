package awsassumerole_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/id"
)

// instanceAccessKeyID is the instance's own AWS credential, which every AssumeRole is signed with.
var instanceAccessKeyID = id.Nonce()

// Isolated: the instance's AWS credentials are instance-wide environment.
func TestMain(m *testing.M) {
	harness.Main(m, harness.Isolated,
		harness.WithInfisicalEnv("INF_APP_CONNECTION_AWS_ACCESS_KEY_ID", instanceAccessKeyID),
		harness.WithInfisicalEnv("INF_APP_CONNECTION_AWS_SECRET_ACCESS_KEY", aws.SecretAccessKey(instanceAccessKeyID)))
}
