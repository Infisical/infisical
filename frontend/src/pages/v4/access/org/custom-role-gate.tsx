import { CustomRolesUpgradeIntent } from "@app/components/license/UpgradeGate/capability-upgrade-intents";
import { isCustomOrgRole } from "@app/helpers/roles";

import { usePlanGate } from "../plan-gate";

export const useCustomRoleGate = (paywallKey: string) => {
  const gate = usePlanGate("rbac", CustomRolesUpgradeIntent, paywallKey);
  const blocked = (roleSlug: string) => isCustomOrgRole(roleSlug) && gate.blocked();
  return { blocked, blockedAny: gate.blocked, upgradeGate: gate.upgradeGate };
};
