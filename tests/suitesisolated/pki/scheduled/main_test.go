// Package scheduled_test runs Certificate Manager's scheduled jobs on demand through the
// instance admin's trigger route. Isolated because a job is instance-wide and the route
// is refused unless the instance allows it.
package scheduled_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) {
	pki.CapParallel()
	harness.Main(m, harness.Isolated, harness.WithInfisicalEnv("ALLOW_CRON_JOB_TRIGGER", "true"))
}
