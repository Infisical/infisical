package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestTenant_IsIsolated(t *testing.T) {
	t.Parallel()
	spec.Why(t, `Slugs matter as much as ids here. A tenant's mail domain is derived from
		its slug, so two tenants sharing one would read each other's invitations, and the
		address-based isolation every email flow relies on would silently stop working.`)

	h := harness.From(t)
	a, b := h.NewTenant(t), h.NewTenant(t)

	if a.OrgID == b.OrgID {
		t.Fatal("two tenants share an organization, so nothing is isolated")
	}
	if a.OrgSlug == b.OrgSlug {
		t.Errorf("two tenants share a slug (%s), so their mail domains collide", a.OrgSlug)
	}
}
