package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestOrganization_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a read when the organization belongs to another tenant", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The claim the Shared profile rests on: if one tenant can reach
			another's organization, parallel tests against one instance are unsound.`)

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)

		// Action
		res, err := mine.Admin.API.GetOrganizationPlanWithResponse(t.Context(), theirs.OrgID.String(), nil)

		// Assert
		require.NoError(t, err)
		require.NotEqualf(t, http.StatusOK, res.StatusCode(),
			"tenant %s read tenant %s's plan", mine.OrgSlug, theirs.OrgSlug)
	})

	t.Run("should refuse a read when the organization does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetOrganizationPlanWithResponse(t.Context(), uuid.NewString(), nil)

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode(), "an organization that does not exist returned a plan")
	})
}
