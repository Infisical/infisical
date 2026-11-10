import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Inline } from "@app/components/v4/ui/layout";
import type {
  BillingCatalogProduct,
  BillingOverview,
  BillingTrial
} from "@app/hooks/api/billing/types";

import { tierLabel } from "../billing-format";

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
  catalog: BillingCatalogProduct[],
  productKey: string,
  tier: string | null
): string => {
  if (!tier) return "a higher plan";
  const prod = catalog.find((candidate) => candidate.id === productKey);
  return prod?.plans.find((plan) => plan.tier === tier)?.name ?? tierLabel(tier);
};

const isRecent = (trial: BillingTrial): boolean =>
  trial.endedDaysAgo === null || trial.endedDaysAgo <= ENDED_NOTICE_DAYS;

const isRecentRevert = (trial: BillingTrial): boolean =>
  trial.outcome === "reverted" && Boolean(trial.basePlanTier) && isRecent(trial);

const isRecentUnpaidEnd = (trial: BillingTrial): boolean =>
  trial.outcome !== "reverted" && trial.endedReason === PAYMENT_NOT_COMPLETED && isRecent(trial);

type Props = {
  overview: BillingOverview;
  catalog: BillingCatalogProduct[];
  readOnly: boolean;
  onManage: (productId: string) => void;
  onUpdatePayment: () => void;
  onContact: (prod: BillingCatalogProduct) => void;
  onCompleteTrialPayment: () => void;
  isCompletingTrialPayment: boolean;
  hasTrialApproval: boolean;
  onOpenTrialApproval: () => void;
};

// A running upgrade trial shows on its product's row. This is only the notice that one ended
// without converting, which has no row of its own.
export const TrialBanners = ({
  overview,
  catalog,
  readOnly,
  onManage,
  onUpdatePayment,
  onContact,
  onCompleteTrialPayment,
  isCompletingTrialPayment,
  hasTrialApproval,
  onOpenTrialApproval
}: Props) => {
  const canAct = overview.selfServe && !readOnly;
  // The trial history is a permanent log, so an unpaid end is stale once the org has moved on.
  const isSuperseded = (trial: BillingTrial): boolean => {
    const entitlement = overview.entitlements[trial.productKey];
    return Boolean(
      entitlement?.trialPlan ||
      entitlement?.isTrialing ||
      (entitlement?.status === "active" && entitlement.planTier !== trial.basePlanTier)
    );
  };
  const reverted = overview.trials
    .filter(isRecentRevert)
    .filter((trial) => !overview.entitlements[trial.productKey]?.trialPlan);
  const unpaid = overview.trials.filter(isRecentUnpaidEnd).filter((trial) => !isSuperseded(trial));

  if (!overview.trialPaymentDue && reverted.length === 0 && unpaid.length === 0) return null;

  return (
    <>
      {overview.trialPaymentDue && (
        <Alert
          tone="warn"
          title="Complete your trial payment"
          actions={
            canAct &&
            (hasTrialApproval ? (
              <Button
                size="sm"
                variant="primary"
                iconRight="external"
                onClick={onOpenTrialApproval}
              >
                Approve payment
              </Button>
            ) : (
              <Button
                size="sm"
                variant="primary"
                loading={isCompletingTrialPayment}
                onClick={onCompleteTrialPayment}
              >
                Complete payment
              </Button>
            ))
          }
        >
          Your bank needs you to confirm this payment. Access continues until{" "}
          {overview.trialPaymentDue.dueAt}.
        </Alert>
      )}
      {reverted.map((trial) => {
        const reason = trial.endedDetail ? REVERTED_REASON[trial.endedDetail] : undefined;
        const catalogProduct = catalog.find((prod) => prod.id === trial.productKey);
        const basePlan = planName(catalog, trial.productKey, trial.basePlanTier);
        return (
          <Alert
            key={`reverted-${trial.productKey}-${trial.planTier ?? ""}`}
            tone="warn"
            title={`Your ${planName(catalog, trial.productKey, trial.planTier)} trial ended`}
            actions={
              canAct && (
                <Inline gap={8}>
                  {reason?.action === "payment" && (
                    <Button size="sm" variant="outline" onClick={onUpdatePayment}>
                      Add a payment method
                    </Button>
                  )}
                  {reason?.action === "contact" && catalogProduct && (
                    <Button size="sm" variant="outline" onClick={() => onContact(catalogProduct)}>
                      Contact support
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => onManage(trial.productKey)}>
                    View plans
                  </Button>
                </Inline>
              )
            }
          >
            {reason?.body ?? "Your trial ended."} You&apos;re still on {basePlan}.
          </Alert>
        );
      })}
      {unpaid.map((trial) => (
        <Alert
          key={`unpaid-${trial.productKey}-${trial.planTier ?? ""}`}
          tone="warn"
          title={`Your ${planName(catalog, trial.productKey, trial.planTier)} trial ended`}
          actions={
            canAct && (
              <Button size="sm" variant="ghost" onClick={() => onManage(trial.productKey)}>
                View plans
              </Button>
            )
          }
        >
          Trial ended because the payment was never completed.
          {trial.basePlanTier && (
            <> You&apos;re still on {planName(catalog, trial.productKey, trial.basePlanTier)}.</>
          )}
        </Alert>
      ))}
    </>
  );
};
