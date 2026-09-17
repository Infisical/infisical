package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/license"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestLicense_PlanOptionReachesTheInstance(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Whether WithPlan registers a stub the application actually resolves.
		Verify reads the plan back with refreshCache=true, so a stub that was never
		reached, or was keyed on the wrong feature name, fails here rather than later as
		an unexplained 403 in a test about something else.`)

	tn := harness.From(t).NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
	tn.Verify(t, license.Enterprise().Without(license.RBAC))
}

func TestLicense_ResolvesPerTenant(t *testing.T) {
	t.Parallel()
	spec.Why(t, `This one is a product behaviour the harness depends on rather than
		something the harness owns: getPlan resolves per organization only in Cloud
		instance type, and every other type short-circuits to one instance-wide feature
		set. It lives here because if it ever changes, per-tenant licensing stops being
		possible and the design has to change with it -- which is a harness problem, not
		a failing product test.`)

	h := harness.From(t)
	narrowed := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
	untouched := h.NewTenant(t)

	untouched.Verify(t, license.Enterprise())
	narrowed.Verify(t, license.Enterprise().Without(license.RBAC))
}
