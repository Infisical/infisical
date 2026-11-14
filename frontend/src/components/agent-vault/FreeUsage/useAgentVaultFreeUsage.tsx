import { useCallback } from "react";

import { AgentVaultUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { OrgPermissionBillingActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { useGetAgentVaultAccess } from "@app/hooks/api/agentVault";

// freeUsage is the org's free Agent Vault requests this month, and null unless the org is on the free tier.
export const useAgentVaultFreeUsage = (paywallKey: string) => {
  const { data: access } = useGetAgentVaultAccess();
  const { permission } = useOrgPermission();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const canAddCard = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );

  const openAddCard = useCallback(
    () => openUpgradeGate({ intent: AgentVaultUpgradeIntent, paywallKey }),
    [openUpgradeGate, paywallKey]
  );

  return {
    freeUsage: access?.freeUsage ?? null,
    isLimitReached: access?.state === "limit-reached",
    warn: Boolean(access?.warn),
    canAddCard,
    openAddCard,
    upgradeGate
  };
};
