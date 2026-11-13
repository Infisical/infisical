import { useCallback } from "react";

import { AgentVaultUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import { useGetAgentVaultAccess } from "@app/hooks/api/agentVault";

// Starting a session, adding a proxy and rotating its token need Agent Vault on the org's plan. Everything else stays
// open. While the access check loads, the action goes ahead and the server refuses it if it must.
export const useAgentVaultPlanGate = () => {
  const { data: access } = useGetAgentVaultAccess();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();

  const withPlan = useCallback(
    (paywallKey: string, action: () => void) => () => {
      if (access && !access.allowed) {
        openUpgradeGate({ intent: AgentVaultUpgradeIntent, paywallKey });
        return;
      }
      action();
    },
    [access, openUpgradeGate]
  );

  return { withPlan, upgradeGate };
};
