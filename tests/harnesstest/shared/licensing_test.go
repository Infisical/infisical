package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestLicense_PlanOptionReachesTheInstance(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Verify reads the plan back with refreshCache=true, so a plan keyed on
		the wrong feature name fails here instead of as an unexplained 403 elsewhere.`)

	// Setup
	plan := license.Enterprise().Without(license.RBAC)

	// Action
	tn := harness.From(t).NewTenant(t, harness.WithPlan(plan))

	// Assert
	tn.Verify(t, plan)
}

func TestLicense_ResolvesPerTenant(t *testing.T) {
	t.Parallel()
	spec.Why(t, `getPlan resolves per organization only in Cloud mode. If that changes,
		per-tenant licensing stops being possible, which is a harness problem.`)

	// Setup
	h := harness.From(t)

	// Action
	narrowed := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
	untouched := h.NewTenant(t)

	// Assert
	untouched.Verify(t, license.Enterprise())
	narrowed.Verify(t, license.Enterprise().Without(license.RBAC))
}
