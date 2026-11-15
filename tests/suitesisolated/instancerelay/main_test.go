package instancerelay_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

// relayAuthSecret is what an instance relay presents to register. It is instance-wide,
// so the package gets an instance of its own.
const relayAuthSecret = "harness-instance-relay-secret"

func TestMain(m *testing.M) {
	harness.Main(m, harness.Isolated, harness.WithInfisicalEnv("RELAY_AUTH_SECRET", relayAuthSecret))
}
