package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestBillingUsage_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the caller's own root org as billable", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewSubOrg(t, tn)

		// Action
		res, err := tn.Admin.API.ListBillableOrganizationsWithResponse(t.Context(), tn.OrgID, &api.ListBillableOrganizationsParams{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Organizations, 1)
		require.Equal(t, tn.OrgID.String(), res.JSON200.Organizations[0].Id)
	})

	t.Run("should break secret manager identities down by the project they were created in", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("secret_identities"), &api.GetBillingUsageBreakdownParams{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		breakdown := res.JSON200.Breakdown
		require.EqualValues(t, 1, breakdown.ScopedCount, "the breakdown attributes machine identities, not users")
		require.Len(t, breakdown.Scopes, 1)
		require.Len(t, breakdown.Scopes[0].Projects, 1)
		require.Equal(t, proj.ID, breakdown.Scopes[0].Projects[0].Id)
	})

	t.Run("should refuse another tenant's billable organizations and breakdowns", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)

		// Action
		orgs, err := other.Admin.API.ListBillableOrganizationsWithResponse(t.Context(), tn.OrgID, &api.ListBillableOrganizationsParams{})
		require.NoError(t, err)
		breakdown, err := other.Admin.API.GetBillingUsageBreakdownWithResponse(t.Context(), tn.OrgID,
			api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{})

		// Assert
		require.NoError(t, err)
		require.Contains(t, []int{http.StatusForbidden, http.StatusNotFound}, orgs.StatusCode())
		require.Contains(t, []int{http.StatusForbidden, http.StatusNotFound}, breakdown.StatusCode())
	})
}
