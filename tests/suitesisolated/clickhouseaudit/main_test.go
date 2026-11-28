package clickhouseaudit_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

// Where audit logs are stored is instance-wide, so the package gets an instance of its own.
func TestMain(m *testing.M) { harness.Main(m, harness.Isolated, harness.WithClickHouse()) }
