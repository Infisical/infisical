package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type billingCall struct {
	name string
	do   func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte)
}

func reads() []billingCall {
	return []billingCall{
		{"the overview", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.GetBillingOverviewWithResponse(t.Context(), orgID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the catalog", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.GetBillingCatalogWithResponse(t.Context(), orgID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the billable organizations", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.ListBillableOrganizationsWithResponse(t.Context(), orgID, &api.ListBillableOrganizationsParams{})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"a usage breakdown", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.GetBillingUsageBreakdownWithResponse(t.Context(), orgID, api.GetBillingUsageBreakdownParamsDimensionKey("identities"), &api.GetBillingUsageBreakdownParams{})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"the entitlement refresh", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.RefreshBillingOverviewWithResponse(t.Context(), orgID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
	}
}

func mutations() []billingCall {
	return []billingCall{
		{"opening the billing portal", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.CreateBillingPortalSessionWithResponse(t.Context(), orgID.String(), api.CreateBillingPortalSessionJSONRequestBody{})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"opening the payment method page", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.CreateBillingPaymentMethodSessionWithResponse(t.Context(), orgID.String(), api.CreateBillingPaymentMethodSessionJSONRequestBody{})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"previewing a change", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.PreviewBillingSubscriptionChangeWithResponse(t.Context(), orgID.String(),
				api.PreviewBillingSubscriptionChangeJSONRequestBody{RemoveProductId: new("secret-manager")})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"buying a product", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.BuyBillingProductWithResponse(t.Context(), orgID.String(), api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"upgrading a product", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.UpgradeBillingProductWithResponse(t.Context(), orgID.String(), api.UpgradeBillingProductJSONRequestBody{
				ProductId: "secret-manager", Plan: "advanced", ExpectedPlanVersionId: uuid.New(),
			})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"removing a product", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.RemoveBillingProductWithResponse(t.Context(), orgID.String(), "secret-manager")
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"changing commitments", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.ChangeBillingCommitmentsWithResponse(t.Context(), orgID.String(), api.ChangeBillingCommitmentsJSONRequestBody{
				ProductId: "secret-manager",
				Changes: []struct {
					DimensionKey string `json:"dimensionKey"`
					Quantity     int    `json:"quantity"`
				}{{DimensionKey: "identities", Quantity: 5}},
			})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"starting a trial", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.StartBillingTrialWithResponse(t.Context(), orgID.String(), api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro"})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"cancelling a trial", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.CancelBillingTrialWithResponse(t.Context(), orgID.String(), api.CancelBillingTrialJSONRequestBody{ProductId: "secret-manager"})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"confirming a trial's payment", func(t *testing.T, c *api.ClientWithResponses, orgID uuid.UUID) (int, []byte) {
			res, err := c.ConfirmBillingTrialPaymentWithResponse(t.Context(), orgID, api.ConfirmBillingTrialPaymentJSONRequestBody{})
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
	}
}

// requireNothingRead proves the License Server was asked for no billing data.
func (b billingServer) requireNothingRead(t *testing.T) {
	t.Helper()
	for _, suffix := range []string{"/products", "/subscription", "/billing/profile", "/billing/trials"} {
		require.Zerof(t, b.Received(t, http.MethodGet, b.path(suffix)), "GET %s must not reach the License Server", suffix)
	}
}

func TestBillingAccess_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a member read billing, which the member role grants", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.OrgRole("member"))

		for _, call := range reads() {
			// Action
			status, body := call.do(t, fresh(t, tn, member), tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusOK, status, "%s answered %d: %s", call.name, status, body)
		}
	})

	t.Run("should refuse a member without billing read on every read, and fetch nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog(), Subscription: activeSubscription()})
		nobody := tn.NewUser(t, harness.OrgRole("no-access"))

		for _, call := range reads() {
			// Action
			status, body := call.do(t, fresh(t, tn, nobody), tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingRead(t)
	})

	t.Run("should refuse a machine identity, which cannot hold a billing session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		// Action
		status, body := reads()[0].do(t, identity.API, tn.OrgID)

		// Assert
		require.Equal(t, http.StatusForbidden, status, string(body))
		ls.requireNothingRead(t)
	})

	t.Run("should refuse another tenant's admin on every read, and fetch nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		ls := openBilling(t, tn)

		for _, call := range reads() {
			// Action
			status, body := call.do(t, other.Admin.API, tn.OrgID)

			// Assert
			require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingRead(t)
	})

	t.Run("should refuse a sub-organization's admin on every read, its own organization included", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		root := openBilling(t, tn)
		own := fixture.LicenseServer(t, tn, sub.ID)

		for _, call := range reads() {
			// Action
			ownStatus, ownBody := call.do(t, sub.Admin.API, sub.ID)
			parentStatus, parentBody := call.do(t, sub.Admin.API, tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, ownStatus, "%s on the sub-organization answered %d: %s", call.name, ownStatus, ownBody)
			require.Equalf(t, http.StatusForbidden, parentStatus, "%s on the parent answered %d: %s", call.name, parentStatus, parentBody)
		}
		root.requireNothingRead(t)
		require.Zero(t, own.Received(t, http.MethodGet, "/v1/organizations/"+sub.ID.String()+"/subscription"))
	})
}

func TestBillingAccess_Mutate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a member with billing read but not manage-billing on every change, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		member := tn.NewUser(t, harness.OrgRole("member"))

		for _, call := range mutations() {
			// Action
			status, body := call.do(t, fresh(t, tn, member), tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a member without billing read on every change, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		nobody := tn.NewUser(t, harness.OrgRole("no-access"))

		for _, call := range mutations() {
			// Action
			status, body := call.do(t, fresh(t, tn, nobody), tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingSent(t)
	})

	t.Run("should let a role that holds manage-billing change billing without billing read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		biller := customRoleUser(t, tn, "biller", fixture.Permission{Subject: "billing", Action: []string{"manage-billing"}})

		// Action
		status, body := mutations()[0].do(t, fresh(t, tn, biller), tn.OrgID)
		overview, overviewBody := reads()[0].do(t, fresh(t, tn, biller), tn.OrgID)

		// Assert
		require.Equal(t, http.StatusOK, status, string(body))
		require.Len(t, ls.sent(t, license.OpPortal), 1)
		require.Equal(t, http.StatusForbidden, overview, string(overviewBody))
	})

	t.Run("should refuse another tenant's admin on every change, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		ls := openBilling(t, tn)

		for _, call := range mutations() {
			// Action
			status, body := call.do(t, other.Admin.API, tn.OrgID)

			// Assert
			require.Containsf(t, []int{http.StatusForbidden, http.StatusNotFound}, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a sub-organization's admin on every change, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		root := openBilling(t, tn)
		own := fixture.LicenseServer(t, tn, sub.ID)

		for _, call := range mutations() {
			// Action
			ownStatus, ownBody := call.do(t, sub.Admin.API, sub.ID)
			parentStatus, parentBody := call.do(t, sub.Admin.API, tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, ownStatus, "%s on the sub-organization answered %d: %s", call.name, ownStatus, ownBody)
			require.Equalf(t, http.StatusForbidden, parentStatus, "%s on the parent answered %d: %s", call.name, parentStatus, parentBody)
		}
		root.requireNothingSent(t)
		require.Empty(t, own.State(t).Billing.Requests)
	})

	t.Run("should refuse a machine identity, which cannot hold a billing session", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		identity := tn.NewMachineIdentity(t, harness.OrgRole("admin"))

		for _, call := range mutations() {
			// Action
			status, body := call.do(t, identity.API, tn.OrgID)

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s answered %d: %s", call.name, status, body)
		}
		ls.requireNothingSent(t)
	})
}
