package syncs_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) {
	pki.CapParallel()
	harness.Main(m, harness.Shared)
}
