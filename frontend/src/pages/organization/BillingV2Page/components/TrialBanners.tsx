import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle, Button } from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Overview, BillingV2Trial } from "@app/hooks/api";

import { tierLabel } from "../billing-v2-format";

// A reverted trial stays in the history forever, so only surface it while it is still actionable.
const REVERTED_NOTICE_DAYS = 14;

const REVERTED_REASON: Record<string, { body: string; action?: "payment" | "contact" }> = {
  no_payment_method: {
    body: "We couldn't charge a card when the trial ended, so nothing changed.",
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

const isRecentRevert = (trial: BillingV2Trial): boolean =>
  trial.outcome === "reverted" &&
  Boolean(trial.basePlanTier) &&
  (trial.endedDaysAgo === null || trial.endedDaysAgo <= REVERTED_NOTICE_DAYS);

type Props = {
  overview: BillingV2Overview;
  catalog: BillingV2CatalogProduct[];
  readOnly: boolean;
  onManage: (productId: string) => void;
  onUpdatePayment: () => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
};

// A running upgrade trial is rendered on the product's own card, not here. This is only the
// after-the-fact notice that one ended without converting, which has no card of its own.
export const TrialBanners = ({
  overview,
  catalog,
  readOnly,
  onManage,
  onUpdatePayment,
  onContact
}: Props) => {
  // A revert that has since been superseded by a running trial of the same product is stale news.
  const reverted = overview.trials
    .filter(isRecentRevert)
    .filter((trial) => !overview.entitlements[trial.productKey]?.trialPlan);

  if (reverted.length === 0) {
    return null;
  }

  return (
    <>
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
              {overview.selfServe && !readOnly && (
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
    </>
  );
};
