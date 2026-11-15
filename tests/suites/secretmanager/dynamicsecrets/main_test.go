package dynamicsecrets_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/postgres"
)

func TestMain(m *testing.M) {
	harness.Main(m, harness.Shared, harness.WithInfra(postgres.Module(postgres.Named(fixture.PostgresTargetInstance))))
}
