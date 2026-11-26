import {
  CustomRolesUpgradeIntent,
  GroupsUpgradeIntent
} from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { isCustomProjectRole } from "@app/helpers/roles";

import { useUpgradeGate } from "../../license";
import { useBillingSubscription } from "../../license/product-icon";

export const useProjectPlanGates = () => {
  const subscription = useBillingSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const rbacBlocked = (paywallKey: string) => {
    if (!subscription || subscription.rbac) return false;
    openUpgradeGate({ intent: CustomRolesUpgradeIntent, paywallKey });
    return true;
  };
  const customRolesBlocked = (slugs: readonly string[], paywallKey: string) =>
    slugs.some(isCustomProjectRole) && rbacBlocked(paywallKey);
  const groupsBlocked = () => {
    if (subscription?.groups) return false;
    openUpgradeGate({ intent: GroupsUpgradeIntent, paywallKey: "project.groups" });
    return true;
  };
  return { subscription, rbacBlocked, customRolesBlocked, groupsBlocked, upgradeGate };
};
