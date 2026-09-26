import { CircleAlert, CreditCard } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Overview, BillingV2Trial } from "@app/hooks/api";

import { tierLabel } from "../billing-v2-format";

// An ended trial stays in the history forever, so only surface it while it is still actionable.
const ENDED_NOTICE_DAYS = 14;

const PAYMENT_NOT_COMPLETED = "payment_not_completed";

const REVERTED_REASON: Record<string, { body: string; action?: "payment" | "contact" }> = {
  no_payment_method: {
    body: "We couldn't charge a card when the trial ended, so nothing changed.",
    action: "payment"
  },
  payment_action_required: {
    body: "Your bank needed you to approve the charge when the trial ended, so nothing changed.",
    action: "payment"
  },
  commitment_not_portable: {
    body: "Your annual commitment couldn't carry over to the new plan, so nothing changed.",
    action: "contact"
  },
  dimension_not_priced: {
    body: "The new plan doesn't price something you're billed for today, so nothing changed.",
    action: "contact"
  }
};

const planName = (
  catalog: BillingV2CatalogProduct[],
  productKey: string,
  tier: string | null
): string => {
  if (!tier) {
    return "a higher plan";
  }
  const prod = catalog.find((candidate) => candidate.id === productKey);
  return prod?.plans.find((plan) => plan.tier === tier)?.name ?? tierLabel(tier);
};

const isRecent = (trial: BillingV2Trial): boolean =>
  trial.endedDaysAgo === null || trial.endedDaysAgo <= ENDED_NOTICE_DAYS;

const isRecentRevert = (trial: BillingV2Trial): boolean =>
  trial.outcome === "reverted" && Boolean(trial.basePlanTier) && isRecent(trial);

const isRecentUnpaidEnd = (trial: BillingV2Trial): boolean =>
  trial.outcome !== "reverted" && trial.endedReason === PAYMENT_NOT_COMPLETED && isRecent(trial);

type Props = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly: boolean;
  onManage: (productId: string) => void;
  onUpdatePayment: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
  onCompleteTrialPayment: () => void;
  isCompletingTrialPayment: boolean;
};

// A running upgrade trial is rendered on the product's own card, not here. This is only the
// after-the-fact notice that one ended without converting, which has no card of its own.
export const TrialBanners = ({
  overview,
  catalog,
  readOnly,
  onManage,
  onUpdatePayment,
  onContact,
  onCompleteTrialPayment,
  isCompletingTrialPayment
}: Props) => {
  const canAct = overview.selfServe && !readOnly;
  // The trial history is a permanent log, so an unpaid end is stale news once the org has moved on:
  // it is trialing the product again, or now holds it on an active paid plan.
  const isSuperseded = (trial: BillingV2Trial): boolean => {
    const entitlement = overview.entitlements[trial.productKey];
    return Boolean(
      entitlement?.trialPlan || entitlement?.isTrialing || entitlement?.status === "active"
    );
  };
  const reverted = overview.trials
    .filter(isRecentRevert)
    .filter((trial) => !overview.entitlements[trial.productKey]?.trialPlan);
  const unpaid = overview.trials.filter(isRecentUnpaidEnd).filter((trial) => !isSuperseded(trial));

  if (!overview.trialPaymentDue && reverted.length === 0 && unpaid.length === 0) {
    return null;
  }

  return (
    <>
      {overview.trialPaymentDue && (
        <Alert variant="warning">
          <CreditCard />
          <AlertTitle>Complete your trial payment</AlertTitle>
          <AlertDescription>
            Your bank needs you to confirm this payment. Access continues until{" "}
            {overview.trialPaymentDue.dueAt}.
            {canAct && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="warning"
                  size="xs"
                  isPending={isCompletingTrialPayment}
                  onClick={onCompleteTrialPayment}
                >
                  Complete payment
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}
      {reverted.map((trial) => {
        const reason = trial.endedDetail ? REVERTED_REASON[trial.endedDetail] : undefined;
        const catalogProduct = catalog.find((prod) => prod.id === trial.productKey);
        const basePlan = planName(catalog, trial.productKey, trial.basePlanTier);

        return (
          <Alert key={`reverted-${trial.productKey}-${trial.planTier ?? ""}`} variant="warning">
            <CircleAlert />
            <AlertTitle>
              Your {planName(catalog, trial.productKey, trial.planTier)} trial ended
            </AlertTitle>
            <AlertDescription>
              {reason?.body ?? "Your trial ended."} You&apos;re still on {basePlan}.
              {canAct && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {reason?.action === "payment" && (
                    <Button variant="outline" size="xs" onClick={onUpdatePayment}>
                      Add a payment method
                    </Button>
                  )}
                  {reason?.action === "contact" && catalogProduct && (
                    <Button variant="outline" size="xs" onClick={() => onContact(catalogProduct)}>
                      Contact support
                    </Button>
                  )}
                  <Button variant="ghost" size="xs" onClick={() => onManage(trial.productKey)}>
                    View plans
                  </Button>
                </div>
              )}
            </AlertDescription>
          </Alert>
        );
      })}
      {unpaid.map((trial) => (
        <Alert key={`unpaid-${trial.productKey}-${trial.planTier ?? ""}`} variant="warning">
          <CircleAlert />
          <AlertTitle>
            Your {planName(catalog, trial.productKey, trial.planTier)} trial ended
          </AlertTitle>
          <AlertDescription>
            Trial ended because the payment was never completed.
            {trial.basePlanTier && (
              <> You&apos;re still on {planName(catalog, trial.productKey, trial.basePlanTier)}.</>
            )}
            {canAct && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="ghost" size="xs" onClick={() => onManage(trial.productKey)}>
                  View plans
                </Button>
              </div>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </>
  );
};
