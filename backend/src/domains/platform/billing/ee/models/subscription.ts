import { TSubscriptionResponse } from "@app/domains/platform/license/ce/module";

import { BillingCadence, TCadence } from "./billing-cadence";
import { BillingDate } from "./billing-date";
import { Money } from "./money";
import { PaymentLink } from "./payment-link";

export type TSubState = "active" | "trialing" | "past-due" | "suspended" | "no-subscription";

export type TNextChargeView = {
  amount: number;
  at: string;
  productKeys: string[];
  cadence: TCadence | null;
  // A usage-based line closes on the same date, so the amount is an estimate.
  hasUsage: boolean;
  // What metered usage so far this period prices to; null when nothing metered is rated.
  estimatedUsage: number | null;
};

// monthlyRecurring and annualCommitted are two independent clocks and are never summed.
export type TBillingSummaryView = {
  monthlyRecurring: number;
  annualCommitted: number;
  activeProductCount: number;
  nextCharge: TNextChargeView | null;
};

export type TTrialPaymentDueView = { dueAt: string; productKeys: string[] };

// A renewal invoice that needs approval or was declined.
export type TPaymentAlertView = { state: "needs_action" | "failed"; actionUrl: string };

// The org's Stripe subscription as the License Server reports it. Null record = no subscription.
export class Subscription {
  private constructor(private readonly record: TSubscriptionResponse | null) {}

  static restore(record: TSubscriptionResponse | null): Subscription {
    return new Subscription(record);
  }

  hasItems(): boolean {
    return Boolean(this.record?.items.length);
  }

  state(): TSubState {
    if (!this.record || !this.record.status) return "no-subscription";
    const status = this.record.status.toLowerCase();
    if (status === "trialing") return "trialing";
    if (status === "past_due") return "past-due";
    if (status === "unpaid" || status === "incomplete") return "suspended";
    if (status === "canceled" || status === "incomplete_expired" || status === "none" || status === "") {
      return "no-subscription";
    }
    return "active";
  }

  // Named from the first item's tier, so enterprise and trial orgs aren't all labelled "Pro".
  planName(): string {
    if (this.state() === "no-subscription") return "Free";
    const tier = this.record?.items[0]?.plan;
    return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "Pro";
  }

  // The next charge is the soonest line to close. A trialing product's usage is rated but never billed, so it adds
  // nothing to the usage estimate or hasUsage.
  billingSummary(activeProductCount: number): TBillingSummaryView {
    const billing = this.record?.billing;
    const closingLines = billing?.nextChargeAt
      ? (billing.lines ?? []).filter((line) => line.currentPeriodEnd === billing.nextChargeAt)
      : [];
    const trialing = new Set(this.trialingProductKeys());
    const billedClosingLines = closingLines.filter((line) => !trialing.has(line.productKey));
    const estimates = billedClosingLines.flatMap((line) =>
      line.estimatedAmountCents === null || line.estimatedAmountCents === undefined ? [] : [line.estimatedAmountCents]
    );
    const usageCents = estimates.length > 0 ? estimates.reduce((sum, cents) => sum + cents, 0) : null;
    const cadences = new Set(closingLines.map((line) => BillingCadence.orMonthly(line.cadence ?? undefined)));
    const nextCharge =
      billing?.nextChargeAt && closingLines.length > 0
        ? {
            amount: Money.dollars(closingLines.reduce((sum, line) => sum + (line.amountCents ?? 0), 0)),
            at: BillingDate.short(billing.nextChargeAt) ?? "",
            productKeys: [...new Set(closingLines.map((line) => line.productKey))],
            cadence: cadences.size === 1 ? [...cadences][0] : null,
            hasUsage: billedClosingLines.some((line) => line.usageBased),
            estimatedUsage: usageCents === null ? null : Money.dollars(usageCents)
          }
        : null;
    return {
      monthlyRecurring: Money.dollars(billing?.monthlyRecurringCents),
      annualCommitted: Money.dollars(billing?.annualRecurringCents),
      activeProductCount,
      nextCharge
    };
  }

  // The earliest trial payment deadline across products, for the page banner.
  trialPaymentDue(): TTrialPaymentDueView | null {
    const awaiting = (this.record?.items ?? []).flatMap((item) => {
      const dueAt = item.trialPaymentDueAt ?? item.trialPlanPaymentDueAt;
      return dueAt ? [{ productId: item.productId, dueAt }] : [];
    });
    if (awaiting.length === 0) return null;
    return {
      dueAt: BillingDate.long(Math.min(...awaiting.map((item) => item.dueAt))) ?? "",
      productKeys: [...new Set(awaiting.map((item) => item.productId))]
    };
  }

  // Only with a link the customer can act on.
  paymentAlert(): TPaymentAlertView | null {
    const payment = this.record?.payment;
    if (!payment || (payment.state !== "needs_action" && payment.state !== "failed")) return null;
    const actionUrl = PaymentLink.httpsOrNull(payment.actionUrl);
    return actionUrl ? { state: payment.state, actionUrl } : null;
  }

  isCheckoutFrozen(): boolean {
    return this.record?.capabilities?.checkoutFrozen ?? false;
  }

  // False for an enterprise-managed org, whose self-serve changes are refused. Older servers omit it.
  isSelfServe(): boolean {
    return this.record?.capabilities?.selfServe ?? true;
  }

  private trialingProductKeys(): string[] {
    return (this.record?.items ?? []).filter((item) => item.isTrialing).map((item) => item.productId);
  }
}
