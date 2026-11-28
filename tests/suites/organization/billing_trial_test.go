package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestBillingTrial_Start(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should start the trial when a card is on file, naming the buyer and the organization to the License Server", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.seed(t, license.BillingState{Catalog: proCatalog()})
		ls.script(t, license.OpTrial, license.TrialStarted())
		tn.NewMachineIdentity(t)

		// Action
		res, err := tn.Admin.API.StartBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "trial_started", res.JSON200.Outcome)
		require.Nil(t, res.JSON200.CardSetupUrl)
		sent := ls.sent(t, license.OpTrial)
		require.Len(t, sent, 1)
		require.Equal(t, "secret-manager", sent[0].Body["product_key"])
		require.Equal(t, "pro", sent[0].Body["plan_key"])
		require.Equal(t, tn.Admin.Email, sent[0].Body["email"])
		require.Equal(t, orgOf(t, tn).Name, sent[0].Body["name"])
		require.Equal(t, map[string]any{"identities": float64(1)}, sent[0].Body["declaredUsage"], "the trial opens showing the present quantities")
		require.Equal(t, returnURL(t, tn, ""), sent[0].Body["returnUrl"])
	})

	t.Run("should send the customer to set up a card, granting nothing yet, when none is on file", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpTrial, license.AwaitingCard("https://checkout.stripe.test/setup/1"))

		// Action
		res, err := tn.Admin.API.StartBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "awaiting_card", res.JSON200.Outcome)
		require.Equal(t, "https://checkout.stripe.test/setup/1", *res.JSON200.CardSetupUrl)
	})

	t.Run("should start the trial without declared usage when the product is not in the catalog", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.StartBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		sent := ls.sent(t, license.OpTrial)
		require.Len(t, sent, 1)
		require.NotContains(t, sent[0].Body, "declaredUsage")
	})

	t.Run("should tell the customer they already used the trial when the License Server refuses it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPost, "/billing/trial", http.StatusConflict, `{"message":"raw","details":{"code":"trial_already_used"}}`)

		// Action
		res, err := tn.Admin.API.StartBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "You've already trialed this plan.")
		require.Equal(t, "trial_already_used", e.Details.Code)
	})

	t.Run("should refuse a return path that could leave the application, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.StartBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.StartBillingTrialJSONRequestBody{ProductId: "secret-manager", Plan: "pro", ReturnPath: new("//evil.test/x")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})
}

func TestBillingTrial_Cancel(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should end the trial and tell the License Server which product", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.CancelBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.CancelBillingTrialJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "trial_completed", res.JSON200.Outcome)
		sent := ls.sent(t, license.OpTrialCancel)
		require.Len(t, sent, 1)
		require.Equal(t, map[string]any{"product_key": "secret-manager"}, sent[0].Body)
	})

	t.Run("should pass on the License Server's refusal when there is no trial to cancel", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPost, "/billing/trial/cancel", http.StatusNotFound, `{"message":"no active trial"}`)

		// Action
		res, err := tn.Admin.API.CancelBillingTrialWithResponse(t.Context(), tn.OrgID.String(),
			api.CancelBillingTrialJSONRequestBody{ProductId: "secret-manager"})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, errorOf(t, res.Body).text(), "no active trial")
	})
}

func TestBillingTrial_ConfirmPayment(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	confirm := func(t *testing.T, tn *harness.Tenant) *api.ConfirmBillingTrialPaymentResponse {
		t.Helper()
		res, err := tn.Admin.API.ConfirmBillingTrialPaymentWithResponse(t.Context(), tn.OrgID, api.ConfirmBillingTrialPaymentJSONRequestBody{})
		require.NoError(t, err)
		return res
	}

	t.Run("should send the customer to a checkout to approve the trial's conversion", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpConfirmPayment, license.ConfirmCheckout("https://checkout.stripe.test/c/3"))

		// Action
		res := confirm(t, tn)

		// Assert
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "checkout_created", res.JSON200.Outcome)
		require.Equal(t, "https://checkout.stripe.test/c/3", *res.JSON200.RedirectUrl)
		sent := ls.sent(t, license.OpConfirmPayment)
		require.Len(t, sent, 1)
		require.Equal(t, returnURL(t, tn, ""), sent[0].Body["returnUrl"])
	})

	t.Run("should send the customer to the invoice their bank holds", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpConfirmPayment, license.ConfirmPaymentAction("https://pay.stripe.test/invoice/4"))

		// Action
		res := confirm(t, tn)

		// Assert
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "payment_action_required", res.JSON200.Outcome)
		require.Equal(t, "https://pay.stripe.test/invoice/4", *res.JSON200.RedirectUrl)
	})

	t.Run("should redirect nowhere when the charge went through without approval", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpConfirmPayment, license.ConfirmUpgraded())

		// Action
		res := confirm(t, tn)

		// Assert
		requireOK(t, res.StatusCode(), res.Body)
		require.EqualValues(t, "upgraded", res.JSON200.Outcome)
		require.Nil(t, res.JSON200.RedirectUrl)
	})

	t.Run("should refuse a checkout link that is not secure", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpConfirmPayment, license.ConfirmCheckout("http://checkout.stripe.test/c/3"))

		// Action
		res := confirm(t, tn)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "We couldn't get a secure checkout link. Please try again or contact support.", errorOf(t, res.Body).text())
	})

	t.Run("should point the customer at the billing portal when the invoice link is not secure", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.script(t, license.OpConfirmPayment, license.ConfirmPaymentAction("http://pay.stripe.test/invoice/4"))

		// Action
		res := confirm(t, tn)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Equal(t, noLinkMessage, e.text())
		require.Equal(t, "payment_action_required", e.Details.Code)
	})

	t.Run("should tell the customer nothing is waiting when no trial awaits payment", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)
		ls.refuse(t, http.MethodPost, "/subscription/trials/confirm-payment", http.StatusConflict, `{"message":"raw","details":{"code":"no_trial_awaiting_payment"}}`)

		// Action
		res := confirm(t, tn)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		e := errorOf(t, res.Body)
		require.Contains(t, e.text(), "There's no trial payment waiting to be completed. It may have already gone through.")
		require.Equal(t, "no_trial_awaiting_payment", e.Details.Code)
	})

	t.Run("should refuse a return path that could leave the application, and send nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ls := openBilling(t, tn)

		// Action
		res, err := tn.Admin.API.ConfirmBillingTrialPaymentWithResponse(t.Context(), tn.OrgID,
			api.ConfirmBillingTrialPaymentJSONRequestBody{ReturnPath: new("//evil.test/x")})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		ls.requireNothingSent(t)
	})
}
