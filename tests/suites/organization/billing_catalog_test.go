package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestBillingCatalog_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should offer nothing when the License Server has no catalog", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetBillingCatalogWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Empty(t, res.JSON200.Products)
	})

	t.Run("should offer the paid self-serve and sales-led plans only, in dollars", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		product := license.SelfServeProduct("secret-manager", "Secrets Management",
			license.PerResourceDimension("identities", "Machine identities", "machine identity"))
		priced := product.Plans[1].Prices
		product.Plans = append(product.Plans,
			license.CatalogPlan{Tier: "scale", Name: "Scale", SalesLed: true},
			license.CatalogPlan{Tier: "managed", Name: "Managed"},
			license.CatalogPlan{Tier: "unpriced", Name: "Unpriced", SelfServe: true},
			license.CatalogPlan{Tier: "advanced", Name: "Advanced", SelfServe: true, Prices: priced})
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{product}}})

		// Action
		res, err := tn.Admin.API.GetBillingCatalogWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.Products, 1)
		var tiers []string
		for _, p := range res.JSON200.Products[0].Plans {
			tiers = append(tiers, p.Tier)
		}
		require.Equal(t, []string{"pro", "scale", "advanced"}, tiers, "free is implicit, a plan that is neither self-serve nor sales-led is not offered, and a self-serve plan with no price is not purchasable")
		dim := res.JSON200.Products[0].Plans[0].Dims[0]
		require.Equal(t, "identities", dim.Key)
		require.InDelta(t, 5, dim.Monthly, 0.001)
		require.InDelta(t, 50, dim.Annual, 0.001)
	})

	t.Run("should never sell a metered dimension per unit, even when the License Server sends its price without a kind", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		product := license.SelfServeProduct("pam", "Privileged Access",
			license.PerResourceDimension("pam_identities", "Identities", "identity"),
			license.MeteredDimension("session_logs", "Session logs", "log"))
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{product}}})

		// Action
		res, err := tn.Admin.API.GetBillingCatalogWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		metered := map[string]bool{}
		for _, d := range res.JSON200.Products[0].Plans[0].Dims {
			metered[d.Key] = d.MeteredMonthly != nil && *d.MeteredMonthly
		}
		require.Equal(t, map[string]bool{"pam_identities": false, "session_logs": true}, metered)
	})

	t.Run("should refuse a member who cannot read billing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		nobody := tn.NewUser(t, harness.OrgRole("no-access"))

		// Action
		res, err := fresh(t, tn, nobody).GetBillingCatalogWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, 0, ls.Received(t, http.MethodGet, ls.path("/products")), "the catalog is not fetched for a caller who may not read it")
	})
}
