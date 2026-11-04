package gateway_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/postgres"
)

// The target database gives the tests an App Connection to attach a gateway or a pool to.
func TestMain(m *testing.M) {
	harness.Main(m, harness.Shared, harness.WithInfra(postgres.Module(postgres.Named(fixture.PostgresTargetInstance))))
}
