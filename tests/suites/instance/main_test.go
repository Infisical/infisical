package instance_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

// Isolated: this package writes instance-wide configuration, so it takes its own
// Postgres, Redis and Infisical rather than sharing the run's. Tests here do not
// call t.Parallel(); across packages they still run concurrently, because each test
// binary gets its own containers.
func TestMain(m *testing.M) { harness.Main(m, harness.Isolated) }
