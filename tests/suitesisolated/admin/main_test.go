// Package admin_test covers instance administration: signup, login methods, server
// admins and the instance config. Isolated because every test writes instance-wide
// configuration.
package admin_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) { harness.Main(m, harness.Isolated) }
