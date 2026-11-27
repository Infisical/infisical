// Package workflowintegration_test covers the Microsoft Teams workflow integration.
// Isolated because the Teams app credentials are instance-wide, set through the admin
// config.
package workflowintegration_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) { harness.Main(m, harness.Isolated) }
