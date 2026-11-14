package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestOrganizationPlan_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the root org's plan with its slug, billable projects and rate limits", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		fixture.NewProject(t, tn, fixture.WithProjectType("kms"))
		fixture.NewProject(t, tn, fixture.WithProjectType("cert-manager"))

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Equal(t, "enterprise", plan["slug"])
		require.EqualValues(t, 2, plan["workspacesUsed"], "cert-manager projects are not billable")
		require.EqualValues(t, license.RateLimitCeiling, plan["rateLimits"].(map[string]any)["readLimit"])
	})

	t.Run("should return the OSS defaults with no slug when the plan is free", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Free))

		// Action
		plan := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Nil(t, plan["slug"])
		require.Equal(t, false, plan["rbac"])
		require.EqualValues(t, 60, plan["rateLimits"].(map[string]any)["readLimit"])
	})

	t.Run("should return the root org's plan to a sub-org, fetched under the root only", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.RBAC)))
		sub := fixture.NewSubOrg(t, tn)
		subScope := fixture.LicenseServer(t, tn, sub.ID)

		// Action
		plan := fixture.Plan(t, sub.Admin.API, sub.ID.String(), true)

		// Assert
		require.Equal(t, false, plan["rbac"], "a sub-org's own scope would answer with rbac on")
		require.Empty(t, subScope.State(t).EntitlementFetches)
	})

	t.Run("should name the root org to the License Server when it fetches a sub-org's plan", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		root := fixture.LicenseServer(t, tn, tn.OrgID)

		// Action
		fixture.Plan(t, sub.Admin.API, sub.ID.String(), true)

		// Assert
		fetches := root.State(t).EntitlementFetches
		require.NotEmpty(t, fetches)
		last := fetches[len(fetches)-1]
		spec.Why(t, "the License Server fills its org directory from these, so they name the root, not the sub-org")
		require.Equal(t, tn.OrgSlug, last.OrgSlug)
		require.NotEmpty(t, last.OrgName)
	})

	t.Run("should not fetch again on a second read, and fetch once when the cache is refreshed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := fixture.LicenseServer(t, tn, tn.OrgID)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)
		before := len(root.State(t).EntitlementFetches)

		// Action
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)
		cached := len(root.State(t).EntitlementFetches)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)

		// Assert
		require.Equal(t, before, cached)
		require.Equal(t, before+1, len(root.State(t).EntitlementFetches))
	})

	t.Run("should keep the current plan and answer with an error when a refresh cannot reach the License Server", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)
		root := fixture.LicenseServer(t, tn, tn.OrgID)
		root.Fail(t, http.MethodGet, "/v1/organizations/"+tn.OrgID.String()+"/entitlements", http.StatusServiceUnavailable, fakenet.Times(1))
		refresh := api.GetOrganizationPlanParamsRefreshCache("true")

		// Action
		res, err := tn.Admin.API.GetOrganizationPlanWithResponse(t.Context(), tn.OrgID.String(), &api.GetOrganizationPlanParams{RefreshCache: &refresh})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Your current plan stays in place")
		require.Equal(t, "enterprise", fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)["slug"])
	})

	t.Run("should serve the OSS fallback and refuse a paid feature when the License Server fails on a cache miss, then recover", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := fixture.LicenseServer(t, tn, tn.OrgID)
		// The plan carries the project count, so creating a project drops the cached plan.
		fixture.NewProject(t, tn)
		root.Fail(t, http.MethodGet, "/v1/organizations/"+tn.OrgID.String()+"/entitlements", http.StatusServiceUnavailable, fakenet.Times(1))

		// Action
		fallback := fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)

		// Assert
		require.Nil(t, fallback["slug"])
		require.Equal(t, false, fallback["groups"])
		res, err := tn.Admin.API.CreateGroupWithResponse(t.Context(), api.CreateGroupJSONRequestBody{Name: "during-outage"})
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "enterprise", fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), true)["slug"])
	})

	t.Run("should serve a sub-org's second request from the cache", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		root := fixture.LicenseServer(t, tn, tn.OrgID)
		fixture.Plan(t, sub.Admin.API, sub.ID.String(), false)
		before := len(root.State(t).EntitlementFetches)

		// Action
		fixture.Plan(t, sub.Admin.API, sub.ID.String(), false)

		// Assert
		require.Equal(t, before, len(root.State(t).EntitlementFetches))
	})
}
