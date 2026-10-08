// Package harnesstest proves the harness, not Infisical.
//
// Separate from suites/ because a failure here means a different thing. A red suite
// says the product is broken; a red harness test says our tooling is. They also have
// different lifetimes: when the API is rewritten in Go the suites are the contract
// and must pass unchanged, while these are about machinery that the rewrite does not
// touch.
package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
)

func TestMain(m *testing.M) { harness.Main(m, harness.Shared) }
