import { CustomRolesUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { isCustomOrgRole } from "@app/helpers/roles";

import { useUpgradeGate } from "../../license";
import { useBillingSubscription } from "../../license/product-icon";

export const useCustomRoleGate = (paywallKey: string) => {
  const subscription = useBillingSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const blocked = (roleSlug: string) => {
    if (!isCustomOrgRole(roleSlug) || !subscription || subscription.rbac) return false;
    openUpgradeGate({ intent: CustomRolesUpgradeIntent, paywallKey });
    return true;
  };
  return { blocked, upgradeGate };
};
