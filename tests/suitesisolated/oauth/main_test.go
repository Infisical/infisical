package oauth_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

// Isolated: these tests change instance-wide signup and login method configuration.
func TestMain(m *testing.M) { harness.Main(m, harness.Isolated) }
