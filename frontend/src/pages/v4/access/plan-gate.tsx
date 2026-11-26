import {
  type CapabilityUpgradeIntent,
  CustomRolesUpgradeIntent,
  GroupsUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { isCustomProjectRole } from "@app/helpers/roles";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import { useUpgradeGate } from "../license";
import { useBillingSubscription } from "../license/product-icon";

type PlanFeature = keyof {
  [K in keyof SubscriptionPlan as SubscriptionPlan[K] extends boolean ? K : never]: true;
};

const usePlanGates = () => {
  const subscription = useBillingSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const blocked = (feature: PlanFeature, intent: CapabilityUpgradeIntent, paywallKey: string) => {
    if (!subscription || subscription[feature]) return false;
    openUpgradeGate({ intent, paywallKey });
    return true;
  };
  return { subscription, openUpgradeGate, blocked, upgradeGate };
};

export const usePlanGate = (
  feature: PlanFeature,
  intent: CapabilityUpgradeIntent,
  paywallKey: string
) => {
  const { blocked, upgradeGate } = usePlanGates();
  return { blocked: () => blocked(feature, intent, paywallKey), upgradeGate };
};

export const useProjectPlanGates = () => {
  const { subscription, openUpgradeGate, blocked, upgradeGate } = usePlanGates();
  const rbacBlocked = (paywallKey: string) => blocked("rbac", CustomRolesUpgradeIntent, paywallKey);
  const customRolesBlocked = (slugs: readonly string[], paywallKey: string) =>
    slugs.some(isCustomProjectRole) && rbacBlocked(paywallKey);
  const groupsBlocked = () => {
    if (subscription?.groups) return false;
    openUpgradeGate({ intent: GroupsUpgradeIntent, paywallKey: "project.groups" });
    return true;
  };
  return { subscription, rbacBlocked, customRolesBlocked, groupsBlocked, upgradeGate };
};
