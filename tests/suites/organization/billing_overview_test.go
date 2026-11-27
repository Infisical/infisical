package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestBillingOverview_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report the free plan and no subscription when the License Server holds none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		o := res.JSON200.Overview
		require.Equal(t, "Free", o.PlanName)
		require.EqualValues(t, "no-subscription", o.SubState)
		require.True(t, o.IsCloud)
		require.EqualValues(t, "self-serve", o.Mode)
		require.True(t, o.SelfServe)
		require.False(t, o.CheckoutFrozen)
	})

	t.Run("should name the plan after the subscription's tier and report its state", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Subscription: activeSubscription()})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Equal(t, "Pro", res.JSON200.Overview.PlanName)
		require.EqualValues(t, "active", res.JSON200.Overview.SubState)
	})

	t.Run("should report the state a subscription status maps to", func(t *testing.T) {
		t.Parallel()

		for status, want := range map[string]string{
			"trialing":           "trialing",
			"past_due":           "past-due",
			"unpaid":             "suspended",
			"incomplete":         "suspended",
			"canceled":           "no-subscription",
			"incomplete_expired": "no-subscription",
		} {
			t.Run("should report "+want+" when the status is "+status, func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				ls := openBilling(t, tn)
				sub := activeSubscription()
				sub.Status = status
				ls.seed(t, license.BillingState{Subscription: sub})

				// Action
				res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

				// Assert
				require.NoError(t, err)
				requireOK(t, res.StatusCode(), res.Body)
				require.EqualValues(t, want, res.JSON200.Overview.SubState)
			})
		}
	})

	t.Run("should derive a product's entitlement from its subscription item and label its dimensions from the catalog", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog(), Subscription: activeSubscription()})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		e := res.JSON200.Overview.Entitlements["secret-manager"]
		require.True(t, e.Entitled)
		require.Equal(t, "pro", *e.PlanTier)
		require.NotNil(t, e.Dimensions)
		require.Len(t, *e.Dimensions, 1)
		dim := (*e.Dimensions)[0]
		require.Equal(t, "Machine identities", dim.Label)
		require.Equal(t, "machine identity", dim.Noun)
		require.EqualValues(t, 3, dim.Used)
		require.EqualValues(t, 10, *dim.Limit)
	})

	t.Run("should fall back to the dimension's key for its label when the catalog cannot be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog(), Subscription: activeSubscription()})
		ls.refuse(t, http.MethodGet, "/products", http.StatusInternalServerError, `{"message":"down"}`)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		dim := (*res.JSON200.Overview.Entitlements["secret-manager"].Dimensions)[0]
		require.Equal(t, "identities", dim.Label)
	})

	t.Run("should list a product the entitlements grant even when no subscription item backs it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		pam, ok := res.JSON200.Overview.Entitlements["pam"]
		require.True(t, ok, "the enterprise plan grants pam")
		require.True(t, pam.Entitled)
		require.Equal(t, "enterprise", *pam.PlanTier)
		require.Nil(t, pam.Dimensions)
	})

	t.Run("should report the payment method, details and invoices of the billing profile, in dollars", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Profile: &license.Profile{
			Payment:        &license.ProfilePayment{Brand: "visa", Last4: "4242", ExpMonth: 12, ExpYear: 2099},
			BillingDetails: &license.ProfileDetails{Name: "Acme", Email: "billing@acme.test"},
			Invoices:       []license.Invoice{{ID: "in_1", Number: "INV-1", Date: 1767225600, Amount: 12345, Paid: true, PDFURL: "https://pay.test/in_1.pdf"}},
		}})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		o := res.JSON200.Overview
		require.Equal(t, "4242", o.Payment.Last4)
		require.Equal(t, "billing@acme.test", o.BillingDetails.Email)
		require.Len(t, o.Invoices, 1)
		require.InDelta(t, 123.45, o.Invoices[0].Amount, 0.001)
		require.Equal(t, "https://pay.test/in_1.pdf", o.Invoices[0].PdfUrl)
	})

	t.Run("should still answer, with no payment method or invoices, when the billing profile cannot be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Subscription: activeSubscription()})
		ls.refuse(t, http.MethodGet, "/billing/profile", http.StatusInternalServerError, `{"message":"down"}`)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		o := res.JSON200.Overview
		require.Equal(t, "Pro", o.PlanName)
		require.Nil(t, o.Payment)
		require.Nil(t, o.BillingDetails)
		require.Empty(t, o.Invoices)
	})

	t.Run("should list the trial history, and which products were trialed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		trials := []license.Trial{{ProductKey: "pam", PlanKey: "pro", Outcome: "expired"}}
		ls.seed(t, license.BillingState{Trials: &trials})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		o := res.JSON200.Overview
		require.Equal(t, []string{"pam"}, o.TrialedProductKeys)
		require.Len(t, o.Trials, 1)
		require.Equal(t, "expired", o.Trials[0].Outcome)
	})

	t.Run("should still answer, with no trial history, when the trials cannot be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		trials := []license.Trial{{ProductKey: "pam", Outcome: "expired"}}
		ls.seed(t, license.BillingState{Subscription: activeSubscription(), Trials: &trials})
		ls.refuse(t, http.MethodGet, "/billing/trials", http.StatusInternalServerError, `{"message":"down"}`)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Equal(t, "Pro", res.JSON200.Overview.PlanName)
		require.Empty(t, res.JSON200.Overview.Trials)
		require.Empty(t, res.JSON200.Overview.TrialedProductKeys)
	})

	t.Run("should fail rather than show the free plan when the subscription cannot be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Subscription: activeSubscription()})
		ls.refuse(t, http.MethodGet, "/subscription", http.StatusInternalServerError, `{"message":"down"}`)

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Nil(t, res.JSON200, "the page must show an error state, not Free")
	})

	t.Run("should report a managed organization as not self-serve and a frozen checkout", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		sub := activeSubscription()
		sub.Capabilities = &license.SubscriptionCapability{CheckoutFrozen: true, SelfServe: false}
		ls.seed(t, license.BillingState{Subscription: sub})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.True(t, res.JSON200.Overview.CheckoutFrozen)
		require.False(t, res.JSON200.Overview.SelfServe)
	})

	t.Run("should offer a payment alert with its link when the link is a secure URL", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		sub := activeSubscription()
		sub.Payment = &license.SubscriptionPayment{State: "needs_action", ActionURL: "https://pay.test/approve"}
		ls.seed(t, license.BillingState{Subscription: sub})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "needs_action", res.JSON200.Overview.PaymentAlert.State)
		require.Equal(t, "https://pay.test/approve", res.JSON200.Overview.PaymentAlert.ActionUrl)
	})

	t.Run("should drop the payment alert when its link is not a secure URL", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		sub := activeSubscription()
		sub.Payment = &license.SubscriptionPayment{State: "needs_action", ActionURL: "http://pay.test/approve"}
		ls.seed(t, license.BillingState{Subscription: sub})

		// Action
		res, err := tn.Admin.API.GetBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Nil(t, res.JSON200.Overview.PaymentAlert)
	})
}

func TestBillingOverview_Refresh(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should fetch the entitlements again and answer success", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)
		before := len(ls.State(t).EntitlementFetches)

		// Action
		res, err := tn.Admin.API.RefreshBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.True(t, res.JSON200.Success)
		require.Equal(t, before+1, len(ls.State(t).EntitlementFetches))
	})

	t.Run("should keep the current plan and fail when the License Server cannot be reached", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)
		ls.refuse(t, http.MethodGet, "/entitlements", http.StatusServiceUnavailable, `{"message":"down"}`)

		// Action
		res, err := tn.Admin.API.RefreshBillingOverviewWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		require.NotEqual(t, http.StatusOK, res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, "enterprise", fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)["slug"])
	})
}
