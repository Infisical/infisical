package organization_test

import (
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	noLinkMessage = "Your bank needs you to approve this payment, but we couldn't get the approval link. Open the billing portal to complete it."
	staleQuote    = "This quote is no longer current. Review the updated total and confirm again."
)

func TestBillingCheckout_Buy(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should send the customer to the checkout the License Server created", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.script(t, license.OpBuy, license.CheckoutCreated("https://checkout.stripe.test/c/1"))

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "checkout_created", res.JSON200.Outcome)
		require.Equal(t, "https://checkout.stripe.test/c/1", *res.JSON200.CheckoutUrl)
		sent := ls.sent(t, license.OpBuy)
		require.Len(t, sent, 1)
		require.Equal(t, "secret-manager", sent[0].Body["productId"])
		require.Equal(t, "pro", sent[0].Body["plan"], "the paid self-serve plan is the default")
		require.Equal(t, "monthly", sent[0].Body["cadence"])
		require.Equal(t, tn.Admin.Email, sent[0].Body["email"], "a first checkout takes the buyer's email from their session")
		require.Equal(t, returnURL(t, tn, ""), sent[0].Body["returnUrl"])
	})

	t.Run("should report the subscription the License Server updated in place", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.script(t, license.OpBuy, license.SubscriptionUpdated("sub_123"))

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "subscription_updated", res.JSON200.Outcome)
		require.Equal(t, "sub_123", *res.JSON200.SubscriptionId)
		require.Nil(t, res.JSON200.CheckoutUrl)
	})

	t.Run("should send the customer to approve the payment when the bank holds the charge", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.script(t, license.OpBuy, license.PaymentActionRequired("https://pay.stripe.test/invoice/1"))

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "payment_action_required", res.JSON200.Outcome)
		require.Equal(t, "https://pay.stripe.test/invoice/1", *res.JSON200.PaymentUrl)
	})

	t.Run("should point the customer at the billing portal when the bank holds the charge and there is no usable link", func(t *testing.T) {
		t.Parallel()

		for name, reply := range map[string]license.Reply{
			"missing":   license.PaymentActionRequired(""),
			"not https": license.PaymentActionRequired("http://pay.stripe.test/invoice/1"),
			"not a URL": license.PaymentActionRequired("not a url"),
		} {
			t.Run("should send the customer to the billing portal when the bank's payment link is "+name+", and tell them why", func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				ls := openBilling(t, tn)
				ls.seed(t, license.BillingState{Catalog: proCatalog()})
				ls.script(t, license.OpBuy, reply)

				// Action
				res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
					api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

				// Assert
				require.NoError(t, err)
				requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
				e := errorOf(t, res.Body)
				require.Equal(t, noLinkMessage, e.text())
				require.Equal(t, "payment_action_required", e.Details.Code)
			})
		}
	})

	t.Run("should refuse a return path that could leave the application, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager", ReturnPath: new("//evil.test/x")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})

	t.Run("should refuse an unknown product and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "nope"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "Product with ID 'nope' not found", errorOf(t, res.Body).text())
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a product that is not sold self-serve and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		salesLed := license.CatalogProduct{
			ID: "pki", Name: "PKI",
			Plans: []license.CatalogPlan{{Tier: "free", Name: "Free", SelfServe: true}, {Tier: "enterprise", Name: "Enterprise", SalesLed: true}},
		}
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{salesLed}}})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "pki"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "This product is not available for self-serve checkout", errorOf(t, res.Body).text())
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a plan that is not self-serve even when the product is, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		product := license.SelfServeProduct("secret-manager", "Secrets Management",
			license.PerResourceDimension("identities", "Machine identities", "machine identity"))
		product.Plans = append(product.Plans, license.CatalogPlan{Tier: "scale", Name: "Scale", SalesLed: true, Prices: product.Plans[1].Prices})
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{product}}})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager", Plan: new("scale")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "This product is not available for self-serve checkout", errorOf(t, res.Body).text())
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a billing cadence the plan has no price for, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		product := license.SelfServeProduct("secret-manager", "Secrets Management",
			license.PerResourceDimension("identities", "Machine identities", "machine identity"))
		product.Plans[1].Prices = product.Plans[1].Prices[:1]
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{product}}})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager", Cadence: new(api.BuyBillingProductJSONBodyCadenceAnnual)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "This product is not available for self-serve checkout", errorOf(t, res.Body).text())
		ls.requireNothingSent(t)
	})

	t.Run("should declare the organization's live identity count to the License Server, members and machine identities together", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		tn.NewUser(t)
		tn.NewMachineIdentity(t)
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		sent := ls.sent(t, license.OpBuy)
		require.Len(t, sent, 1)
		require.Equal(t, map[string]any{"identities": float64(3)}, sent[0].Body["declaredUsage"], "the identities meter counts the invited member and both machine identities, not the admin")
		require.NotContains(t, sent[0].Body, "quantities", "a monthly line commits nothing")
	})

	t.Run("should commit the buyer's quantity on an annual line while declaring the live count", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		tn.NewMachineIdentity(t)
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{
				ProductId:  "secret-manager",
				Cadence:    new(api.BuyBillingProductJSONBodyCadenceAnnual),
				Quantities: &map[string]int{"identities": 10},
			})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		sent := ls.sent(t, license.OpBuy)
		require.Len(t, sent, 1)
		require.Equal(t, "annual", sent[0].Body["cadence"])
		require.Equal(t, map[string]any{"identities": float64(10)}, sent[0].Body["quantities"])
		require.Equal(t, map[string]any{"identities": float64(2)}, sent[0].Body["declaredUsage"], "a commitment is never sourced into the declared usage")
	})

	t.Run("should commit the present count on an annual line when the buyer enters no quantity", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager", Cadence: new(api.BuyBillingProductJSONBodyCadenceAnnual)})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		sent := ls.sent(t, license.OpBuy)
		require.Len(t, sent, 1)
		require.Equal(t, map[string]any{"identities": float64(1)}, sent[0].Body["quantities"])
	})

	t.Run("should leave a metered dimension out of the declared usage and the commitment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		product := license.SelfServeProduct("secret-manager", "Secrets Management",
			license.PerResourceDimension("identities", "Machine identities", "machine identity"),
			license.MeteredDimension("secret_reads", "Secret reads", "read"))
		ls.seed(t, license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{product}}})
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager", Cadence: new(api.BuyBillingProductJSONBodyCadenceAnnual)})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		sent := ls.sent(t, license.OpBuy)
		require.Len(t, sent, 1)
		require.Equal(t, map[string]any{"identities": float64(1)}, sent[0].Body["declaredUsage"])
		require.Equal(t, map[string]any{"identities": float64(1)}, sent[0].Body["quantities"])
	})

	t.Run("should show the customer the License Server's reason for a refusal, with its code", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.refuse(t, http.MethodPost, "/subscription/products", http.StatusConflict, `{"message":"raw","details":{"code":"product_already_held"}}`)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "You already have this product. Remove it before adding it again.")
		require.Equal(t, "product_already_held", e.Details.Code)
	})

	t.Run("should fail without leaking the License Server's error when it answers 500", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.refuse(t, http.MethodPost, "/subscription/products", http.StatusInternalServerError, `{"message":"stripe key sk_live_secret"}`)

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Contains(t, errorOf(t, res.Body).text(), "Billing service error")
		require.NotContains(t, string(res.Body), "sk_live_secret")
	})

	t.Run("should fail when the License Server created a checkout without a URL", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.script(t, license.OpBuy, license.Reply{Body: map[string]any{"outcome": "checkout_created"}})

		// Action
		res, err := tn.Admin.API.BuyBillingProductWithResponse(t.Context(), tn.OrgID.String(),
			api.BuyBillingProductJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Equal(t, "Checkout session did not return a URL", errorOf(t, res.Body).text())
	})
}

func TestBillingCheckout_Preview(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should price an added product in dollars and send the License Server the line it would buy", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{AddProductId: new("secret-manager")})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		p := res.JSON200.Preview
		require.Equal(t, "usd", p.Currency)
		require.InDelta(t, 15, p.ProrationAmount, 0.001)
		require.InDelta(t, 5, p.AdditionalCharges, 0.001)
		require.InDelta(t, 20, p.TotalDueNow, 0.001)
		require.InDelta(t, 30, p.NextInvoiceTotal, 0.001)
		require.Len(t, p.Lines, 1)
		require.InDelta(t, 20, p.Lines[0].Amount, 0.001)
		sent := ls.sent(t, license.OpPreview)
		require.Len(t, sent, 1)
		add := sent[0].Body["add"].([]any)[0].(map[string]any)
		require.Equal(t, "secret-manager", add["productId"])
		require.Equal(t, "pro", add["plan"])
		require.Equal(t, map[string]any{"identities": float64(1)}, add["declaredUsage"])
	})

	t.Run("should send the License Server a removal, an upgrade and commitment changes as they were asked for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		removal, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{RemoveProductId: new("pam")})
		require.NoError(t, err)
		upgrade, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{UpgradeProductId: new("secret-manager"), UpgradePlan: new("advanced")})
		require.NoError(t, err)
		commit, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{CommitmentChanges: &[]struct {
				DimensionKey string `json:"dimensionKey"`
				Quantity     int    `json:"quantity"`
			}{{DimensionKey: "identities", Quantity: 25}}})

		// Assert
		require.NoError(t, err)
		requireOK(t, removal.StatusCode(), removal.Body)
		requireOK(t, upgrade.StatusCode(), upgrade.Body)
		requireOK(t, commit.StatusCode(), commit.Body)
		sent := ls.sent(t, license.OpPreview)
		require.Len(t, sent, 3)
		require.Equal(t, []any{"pam"}, sent[0].Body["remove"])
		require.Equal(t, map[string]any{"productId": "secret-manager", "plan": "advanced"}, sent[1].Body["upgrade"])
		require.Equal(t, []any{map[string]any{"dimensionKey": "identities", "quantity": float64(25)}}, sent[2].Body["commitmentChanges"])
	})

	t.Run("should refuse a preview that asks for nothing, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, errorOf(t, res.Body).text(), "provide a product to add, remove or upgrade, or a commitment change")
		ls.requireNothingSent(t)
	})

	t.Run("should refuse an upgrade that names no plan, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{UpgradeProductId: new("secret-manager")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, errorOf(t, res.Body).text(), "upgradePlan is required when upgradeProductId is set")
		ls.requireNothingSent(t)
	})

	t.Run("should refuse an upgrade combined with adding or removing the same product, and send nothing", func(t *testing.T) {
		t.Parallel()

		for name, body := range map[string]api.PreviewBillingSubscriptionChangeJSONRequestBody{
			"adding":   {UpgradeProductId: new("secret-manager"), UpgradePlan: new("advanced"), AddProductId: new("secret-manager")},
			"removing": {UpgradeProductId: new("secret-manager"), UpgradePlan: new("advanced"), RemoveProductId: new("secret-manager")},
		} {
			t.Run("should refuse an upgrade combined with "+name+" the same product, and send nothing", func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				ls := openBilling(t, tn)

				// Action
				res, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(), body)

				// Assert
				require.NoError(t, err)
				requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
				require.Equal(t, "A plan change cannot be combined with adding or removing the same product", errorOf(t, res.Body).text())
				ls.requireNothingSent(t)
			})
		}
	})

	t.Run("should refuse to preview adding a product that is not sold self-serve", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})

		// Action
		unknown, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{AddProductId: new("nope")})
		require.NoError(t, err)
		notOffered, err := tn.Admin.API.PreviewBillingSubscriptionChangeWithResponse(t.Context(), tn.OrgID.String(),
			api.PreviewBillingSubscriptionChangeJSONRequestBody{AddProductId: new("secret-manager"), Plan: new("enterprise")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, unknown.StatusCode(), unknown.Body)
		requireStatus(t, http.StatusBadRequest, notOffered.StatusCode(), notOffered.Body)
		require.Equal(t, "This product is not available for self-serve checkout", errorOf(t, notOffered.Body).text())
		ls.requireNothingSent(t)
	})
}

func TestBillingCheckout_Upgrade(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	upgrade := func(prorationDate *int) api.UpgradeBillingProductJSONRequestBody {
		return api.UpgradeBillingProductJSONRequestBody{
			ProductId: "secret-manager", Plan: "advanced", ExpectedPlanVersionId: uuid.MustParse("11111111-2222-3333-4444-555555555555"),
			ProrationDate: prorationDate,
		}
	}

	t.Run("should move the product to the plan and report what changed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpUpgrade, license.Upgraded("sub_1", "pro", "advanced"))
		quoted := int(time.Now().Add(-time.Minute).Unix())

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(&quoted))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "upgraded", res.JSON200.Outcome)
		require.Equal(t, "pro", *res.JSON200.FromPlanKey)
		require.Equal(t, "advanced", *res.JSON200.ToPlanKey)
		sent := ls.sent(t, license.OpUpgrade)
		require.Len(t, sent, 1)
		require.Equal(t, "secret-manager", sent[0].Body["productId"])
		require.Equal(t, "advanced", sent[0].Body["plan"])
		require.Equal(t, "11111111-2222-3333-4444-555555555555", sent[0].Body["expectedPlanVersionId"])
		require.EqualValues(t, quoted, sent[0].Body["prorationDate"], "the quote the customer saw is the one charged")
	})

	t.Run("should send the customer to approve the payment when the bank holds the upgrade's charge", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpUpgrade, license.PaymentActionRequired("https://pay.stripe.test/invoice/2"))

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(nil))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "payment_action_required", res.JSON200.Outcome)
		require.Equal(t, "https://pay.stripe.test/invoice/2", *res.JSON200.PaymentUrl)
	})

	t.Run("should point the customer at the billing portal when the bank holds the charge and there is no usable link", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpUpgrade, license.PaymentActionRequired(""))

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(nil))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Equal(t, noLinkMessage, e.text())
		require.Equal(t, "payment_action_required", e.Details.Code)
	})

	t.Run("should refuse a stale quote and never ask the License Server to charge it", func(t *testing.T) {
		t.Parallel()

		for name, quoted := range map[string]time.Time{
			"older than fifteen minutes": time.Now().Add(-16 * time.Minute),
			"from the future":            time.Now().Add(5 * time.Minute),
		} {
			t.Run("should refuse a quote "+name+", and never ask the License Server to charge it", func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				ls := openBilling(t, tn)
				date := int(quoted.Unix())

				// Action
				res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(&date))

				// Assert
				require.NoError(t, err)
				requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
				require.Equal(t, staleQuote, errorOf(t, res.Body).text())
				ls.requireNothingSent(t)
				require.Equal(t, 0, ls.Received(t, http.MethodPost, ls.path("/subscription/upgrade")))
			})
		}
	})

	t.Run("should accept a quote that is still within fifteen minutes", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		date := int(time.Now().Add(-10 * time.Minute).Unix())

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(&date))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Len(t, ls.sent(t, license.OpUpgrade), 1)
	})

	t.Run("should tell the customer prices moved when the plan version changed under their quote", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPost, "/subscription/upgrade", http.StatusConflict, `{"message":"raw","details":{"code":"version_moved"}}`)

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithResponse(t.Context(), tn.OrgID.String(), upgrade(nil))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "Prices changed while you were reviewing. Check the new total and try again.")
		require.Equal(t, "version_moved", e.Details.Code)
	})

	t.Run("should refuse a plan version that is not an id, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.UpgradeBillingProductWithBodyWithResponse(t.Context(), tn.OrgID.String(), "application/json",
			jsonBody(`{"productId":"secret-manager","plan":"advanced","expectedPlanVersionId":"latest"}`))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})
}

func TestBillingCommitments_Change(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	changes := func(quantity int) api.ChangeBillingCommitmentsJSONRequestBody {
		return api.ChangeBillingCommitmentsJSONRequestBody{
			ProductId: "secret-manager",
			Changes: []struct {
				DimensionKey string `json:"dimensionKey"`
				Quantity     int    `json:"quantity"`
			}{{DimensionKey: "identities", Quantity: quantity}},
		}
	}

	t.Run("should apply the commitment in place and send the License Server the dimensions asked for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpCommitments, license.SubscriptionUpdated("sub_9"))

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(25))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "subscription_updated", res.JSON200.Outcome)
		require.Equal(t, "sub_9", *res.JSON200.SubscriptionId)
		sent := ls.sent(t, license.OpCommitments)
		require.Len(t, sent, 1)
		require.Equal(t, http.MethodPut, sent[0].Method)
		require.Equal(t, "secret-manager", sent[0].Body["productId"])
		require.Equal(t, []any{map[string]any{"dimensionKey": "identities", "quantity": float64(25)}}, sent[0].Body["dimensions"])
	})

	t.Run("should send the customer to the checkout when the commitment needs one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpCommitments, license.CheckoutCreated("https://checkout.stripe.test/c/2"))

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(25))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "checkout_created", res.JSON200.Outcome)
		require.Equal(t, "https://checkout.stripe.test/c/2", *res.JSON200.CheckoutUrl)
	})

	t.Run("should send the customer to approve the payment when the bank holds the charge", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpCommitments, license.PaymentActionRequired("https://pay.stripe.test/invoice/3"))

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(25))

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "payment_action_required", res.JSON200.Outcome)
		require.Equal(t, "https://pay.stripe.test/invoice/3", *res.JSON200.PaymentUrl)
	})

	t.Run("should point the customer at the billing portal when the bank holds the charge and there is no usable link", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpCommitments, license.PaymentActionRequired(""))

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(25))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, noLinkMessage, errorOf(t, res.Body).text())
	})

	t.Run("should refuse a change with no dimensions, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithBodyWithResponse(t.Context(), tn.OrgID.String(), "application/json",
			jsonBody(`{"productId":"secret-manager","changes":[]}`))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})

	t.Run("should refuse a negative quantity, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(-1))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})

	t.Run("should tell the customer a commitment cannot be reduced yet when the License Server refuses the decrease", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPut, "/subscription/commitments", http.StatusConflict, `{"message":"raw","details":{"code":"commitment_decrease_locked"}}`)

		// Action
		res, err := tn.Admin.API.ChangeBillingCommitmentsWithResponse(t.Context(), tn.OrgID.String(), changes(1))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "Commitments can't be reduced until the final window before your renewal.")
		require.Equal(t, "commitment_decrease_locked", e.Details.Code)
	})
}

func TestBillingProduct_Remove(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should ask the License Server to remove the product and report the subscription", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpRemove, license.SubscriptionUpdated("sub_5"))

		// Action
		res, err := tn.Admin.API.RemoveBillingProductWithResponse(t.Context(), tn.OrgID.String(), "secret-manager")

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Equal(t, "sub_5", *res.JSON200.SubscriptionId)
		sent := ls.sent(t, license.OpRemove)
		require.Len(t, sent, 1)
		require.Equal(t, http.MethodDelete, sent[0].Method)
		require.Equal(t, ls.path("/subscription/products/secret-manager"), sent[0].Path)
	})

	t.Run("should report the subscription when removing the last product cancelled it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpRemove, license.SubscriptionCanceled("sub_6"))

		// Action
		res, err := tn.Admin.API.RemoveBillingProductWithResponse(t.Context(), tn.OrgID.String(), "secret-manager")

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.Equal(t, "sub_6", *res.JSON200.SubscriptionId)
	})

	t.Run("should tell the customer billing is managed by the account team when the organization is not self-serve", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodDelete, "/subscription/products/secret-manager", http.StatusForbidden, `{"message":"raw","details":{"code":"not_self_serve"}}`)

		// Action
		res, err := tn.Admin.API.RemoveBillingProductWithResponse(t.Context(), tn.OrgID.String(), "secret-manager")

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "Billing for this organization is managed by our team. Contact sales to make changes.")
		require.Equal(t, "not_self_serve", e.Details.Code)
	})
}

func TestBillingPortal_Session(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	type session func(t *testing.T, tn *harness.Tenant, returnPath *string) (status int, body []byte, url string)
	sessions := map[string]session{
		"the billing portal": func(t *testing.T, tn *harness.Tenant, returnPath *string) (int, []byte, string) {
			res, err := tn.Admin.API.CreateBillingPortalSessionWithResponse(t.Context(), tn.OrgID.String(),
				api.CreateBillingPortalSessionJSONRequestBody{ReturnPath: returnPath})
			require.NoError(t, err)
			if res.JSON200 == nil {
				return res.StatusCode(), res.Body, ""
			}
			return res.StatusCode(), res.Body, res.JSON200.Url
		},
		"the payment method page": func(t *testing.T, tn *harness.Tenant, returnPath *string) (int, []byte, string) {
			res, err := tn.Admin.API.CreateBillingPaymentMethodSessionWithResponse(t.Context(), tn.OrgID.String(),
				api.CreateBillingPaymentMethodSessionJSONRequestBody{ReturnPath: returnPath})
			require.NoError(t, err)
			if res.JSON200 == nil {
				return res.StatusCode(), res.Body, ""
			}
			return res.StatusCode(), res.Body, res.JSON200.Url
		},
	}

	for name, open := range sessions {
		t.Run("should open "+name+" the License Server created, returning to the billing page by default", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			ls := openBilling(t, tn)
			ls.script(t, license.OpPortal, license.PortalSession("https://billing.stripe.test/session/1"))

			// Action
			status, body, url := open(t, tn, nil)

			// Assert
			requireOK(t, status, body)
			require.Equal(t, "https://billing.stripe.test/session/1", url)
			sent := ls.sent(t, license.OpPortal)
			require.Len(t, sent, 1)
			require.Equal(t, returnURL(t, tn, ""), sent[0].Body["returnUrl"])
		})

		t.Run("should return to the page the caller named when opening "+name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			ls := openBilling(t, tn)
			path := "/organizations/" + tn.OrgID.String() + "/billing/usage?tab=identities#top"

			// Action
			status, body, _ := open(t, tn, &path)

			// Assert
			requireOK(t, status, body)
			sent := ls.sent(t, license.OpPortal)
			require.Len(t, sent, 1)
			require.Equal(t, returnURL(t, tn, path), sent[0].Body["returnUrl"])
		})

		for _, bad := range []string{"//evil.test/x", "/\\evil.test", "https://evil.test/x", "/a//b", "/a\nb"} {
			t.Run("should refuse the return path "+strconv.Quote(bad)+" when opening "+name+", and send nothing", func(t *testing.T) {
				t.Parallel()

				// Setup
				tn := h.NewTenant(t)
				ls := openBilling(t, tn)

				// Action
				status, body, _ := open(t, tn, &bad)

				// Assert
				requireStatus(t, http.StatusUnprocessableEntity, status, body)
				ls.requireNothingSent(t)
			})
		}
	}

	t.Run("should fail without leaking the License Server's error when it answers 500", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPost, "/billing/portal-session", http.StatusInternalServerError, `{"message":"stripe key sk_live_secret"}`)

		// Action
		res, err := tn.Admin.API.CreateBillingPortalSessionWithResponse(t.Context(), tn.OrgID.String(), api.CreateBillingPortalSessionJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.NotContains(t, string(res.Body), "sk_live_secret")
	})
}
