import type { CapabilityUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import { useUpgradeGate } from "../license";
import { useBillingSubscription } from "../license/product-icon";

type PlanFeature = keyof {
  [K in keyof SubscriptionPlan as SubscriptionPlan[K] extends boolean ? K : never]: true;
};

export const usePlanGate = (
  feature: PlanFeature,
  intent: CapabilityUpgradeIntent,
  paywallKey: string
) => {
  const subscription = useBillingSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const blocked = () => {
    if (!subscription || subscription[feature]) return false;
    openUpgradeGate({ intent, paywallKey });
    return true;
  };
  return { blocked, upgradeGate };
};
