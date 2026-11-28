import { TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

import { BillingDate } from "./billing-date";
import { Subscription } from "./subscription";

type TItem = TSubscriptionResponse["items"][number];
type TLine = NonNullable<NonNullable<TSubscriptionResponse["billing"]>["lines"]>[number];

const item = (overrides: Partial<TItem> = {}): TItem => ({
  productId: "secrets",
  plan: "pro",
  quantities: {},
  limits: {},
  isTrialing: false,
  dimensions: [],
  ...overrides
});

const line = (overrides: Partial<TLine> = {}): TLine => ({
  productKey: "secrets",
  usageBased: false,
  ...overrides
});

const record = (overrides: Partial<TSubscriptionResponse> = {}): TSubscriptionResponse => ({
  status: "active",
  items: [item()],
  ...overrides
});

const withBilling = (lines: TLine[], nextChargeAt: number, items: TItem[] = [item()]) =>
  record({ items, billing: { monthlyRecurringCents: 0, annualRecurringCents: 0, nextChargeAt, lines } });

describe("Subscription.state", () => {
  test.each([
    ["trialing", "trialing"],
    ["TRIALING", "trialing"],
    ["past_due", "past-due"],
    ["unpaid", "suspended"],
    ["incomplete", "suspended"],
    ["canceled", "no-subscription"],
    ["incomplete_expired", "no-subscription"],
    ["none", "no-subscription"],
    ["", "no-subscription"],
    ["active", "active"],
    ["paused", "active"]
  ])("should map the %s status to %s", (status, state) => {
    // Setup
    const subscription = Subscription.restore(record({ status }));

    // Action
    const result = subscription.state();

    // Assert
    expect(result).toBe(state);
  });

  test("should read a missing subscription as no-subscription", () => {
    // Setup
    const subscription = Subscription.restore(null);

    // Action
    const result = subscription.state();

    // Assert
    expect(result).toBe("no-subscription");
  });
});

describe("Subscription.planName", () => {
  test("should be Free without a subscription, the capitalised tier with one, and Pro when no item names a tier", () => {
    // Setup
    const free = Subscription.restore(null);
    const enterprise = Subscription.restore(record({ items: [item({ plan: "enterprise" })] }));
    const unnamed = Subscription.restore(record({ items: [] }));

    // Action
    const result = [free.planName(), enterprise.planName(), unnamed.planName()];

    // Assert
    expect(result).toEqual(["Free", "Enterprise", "Pro"]);
  });
});

describe("Subscription.billingSummary", () => {
  test("should sum only the lines closing on the next charge date", () => {
    // Setup
    const closing = 1_800_000_000;
    const subscription = Subscription.restore(
      withBilling(
        [
          line({ amountCents: 1000, currentPeriodEnd: closing, cadence: "monthly" }),
          line({ productKey: "pam", amountCents: 2500, currentPeriodEnd: closing, cadence: "monthly" }),
          line({ productKey: "certs", amountCents: 99999, currentPeriodEnd: closing + 1000, cadence: "annual" })
        ],
        closing
      )
    );

    // Action
    const { nextCharge } = subscription.billingSummary(2);

    // Assert
    expect(nextCharge).toMatchObject({
      amount: 35,
      at: BillingDate.short(closing),
      productKeys: ["secrets", "pam"],
      cadence: "monthly"
    });
  });

  test("should leave the cadence null when the closing lines mix monthly and annual", () => {
    // Setup
    const closing = 1_800_000_000;
    const subscription = Subscription.restore(
      withBilling(
        [
          line({ amountCents: 1000, currentPeriodEnd: closing, cadence: "monthly" }),
          line({ productKey: "pam", amountCents: 5000, currentPeriodEnd: closing, cadence: "annual" })
        ],
        closing
      )
    );

    // Action
    const { nextCharge } = subscription.billingSummary(2);

    // Assert
    expect(nextCharge?.cadence).toBeNull();
  });

  test("should bill a trialing product's lines but leave them out of the usage flag and estimate", () => {
    // Setup
    const closing = 1_800_000_000;
    const subscription = Subscription.restore(
      withBilling(
        [
          line({
            productKey: "pam",
            amountCents: 2000,
            usageBased: true,
            estimatedAmountCents: 700,
            currentPeriodEnd: closing
          }),
          line({ productKey: "secrets", amountCents: 1000, currentPeriodEnd: closing })
        ],
        closing,
        [item({ productId: "pam", isTrialing: true }), item({ productId: "secrets" })]
      )
    );

    // Action
    const { nextCharge } = subscription.billingSummary(2);

    // Assert
    expect(nextCharge).toMatchObject({ amount: 30, hasUsage: false, estimatedUsage: null });
  });

  test("should flag usage and sum its estimate for a billed usage-based line", () => {
    // Setup
    const closing = 1_800_000_000;
    const subscription = Subscription.restore(
      withBilling(
        [line({ usageBased: true, amountCents: 1500, estimatedAmountCents: 500, currentPeriodEnd: closing })],
        closing
      )
    );

    // Action
    const { nextCharge } = subscription.billingSummary(1);

    // Assert
    expect(nextCharge).toMatchObject({ hasUsage: true, estimatedUsage: 5 });
  });

  test("should have no next charge without a subscription, and report recurring totals in dollars", () => {
    // Setup
    const none = Subscription.restore(null);
    const recurring = Subscription.restore(
      record({ billing: { monthlyRecurringCents: 12345, annualRecurringCents: 600000, lines: [] } })
    );

    // Action
    const result = [none.billingSummary(0), recurring.billingSummary(1)];

    // Assert
    expect(result).toEqual([
      { monthlyRecurring: 0, annualCommitted: 0, activeProductCount: 0, nextCharge: null },
      { monthlyRecurring: 123.45, annualCommitted: 6000, activeProductCount: 1, nextCharge: null }
    ]);
  });
});

describe("Subscription.trialPaymentDue", () => {
  test("should pick the earliest deadline across products and list each product once", () => {
    // Setup
    const early = 1_800_000_000;
    const subscription = Subscription.restore(
      record({
        items: [
          item({ productId: "pam", trialPaymentDueAt: early + 86400 }),
          item({ productId: "secrets", trialPlanPaymentDueAt: early }),
          item({ productId: "certs" })
        ]
      })
    );

    // Action
    const due = subscription.trialPaymentDue();

    // Assert
    expect(due).toEqual({ dueAt: BillingDate.long(early), productKeys: ["pam", "secrets"] });
  });

  test("should be null when no product awaits a payment", () => {
    // Setup
    const subscription = Subscription.restore(record());

    // Action
    const due = subscription.trialPaymentDue();

    // Assert
    expect(due).toBeNull();
  });
});

describe("Subscription.paymentAlert", () => {
  test.each(["needs_action", "failed"] as const)("should alert on a %s payment that has an https link", (state) => {
    // Setup
    const actionUrl = "https://invoice.stripe.com/i/abc";
    const subscription = Subscription.restore(record({ payment: { state, actionUrl } }));

    // Action
    const alert = subscription.paymentAlert();

    // Assert
    expect(alert).toEqual({ state, actionUrl });
  });

  test("should not alert without a safe link, or for a payment that needs nothing", () => {
    // Setup
    const http = Subscription.restore(record({ payment: { state: "failed", actionUrl: "http://x.test/pay" } }));
    const noLink = Subscription.restore(record({ payment: { state: "needs_action" } }));
    const paid = Subscription.restore(record({ payment: { state: "paid", actionUrl: "https://x.test/pay" } }));

    // Action
    const result = [http.paymentAlert(), noLink.paymentAlert(), paid.paymentAlert()];

    // Assert
    expect(result).toEqual([null, null, null]);
  });
});

describe("Subscription capabilities", () => {
  test("should default to checkout open and self-serve when the server sends none", () => {
    // Setup
    const subscription = Subscription.restore(record());

    // Action
    const result = [subscription.isCheckoutFrozen(), subscription.isSelfServe()];

    // Assert
    expect(result).toEqual([false, true]);
  });

  test("should honour a frozen checkout and an enterprise-managed org", () => {
    // Setup
    const subscription = Subscription.restore(record({ capabilities: { checkoutFrozen: true, selfServe: false } }));

    // Action
    const result = [subscription.isCheckoutFrozen(), subscription.isSelfServe()];

    // Assert
    expect(result).toEqual([true, false]);
  });
});
