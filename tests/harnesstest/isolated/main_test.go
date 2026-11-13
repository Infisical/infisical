// Package harnesstest proves the parts of the harness that need a package of their
// own: the Isolated profile and everything that follows from it.
package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) { harness.Main(m, harness.Isolated) }
