package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestTenant_IsIsolated(t *testing.T) {
	t.Parallel()
	spec.Why(t, `A tenant's mail domain derives from its slug, so a shared slug would
		break address-based mail isolation silently.`)

	// Setup
	h := harness.From(t)

	// Action
	a, b := h.NewTenant(t), h.NewTenant(t)

	// Assert
	require.NotEqual(t, a.OrgID, b.OrgID)
	require.NotEqual(t, a.OrgSlug, b.OrgSlug)
}
