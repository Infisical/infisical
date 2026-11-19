// Package secretreadlimit_test covers the limit on how many secrets one API read can
// return. Isolated because the limit is switched on and sized by instance-wide
// environment variables.
package secretreadlimit_test

import (
	"strconv"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

const maxSecretsPerRead = 5

func TestMain(m *testing.M) {
	harness.Main(m, harness.Isolated,
		harness.WithInfisicalEnv("SECRET_READ_LIMIT_ENABLED", "true"),
		harness.WithInfisicalEnv("MAX_SECRETS_PER_READ_REQUEST", strconv.Itoa(maxSecretsPerRead)),
	)
}
