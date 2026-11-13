import { useEffect, useRef } from "react";
import { Outlet } from "@tanstack/react-router";

import {
  AgentVaultIntroModal,
  useAgentVaultIntro
} from "@app/components/agent-vault/AgentVaultIntro";
import {
  AgentVaultAddCardUpgradeIntent,
  useUpgradeGate
} from "@app/components/license/UpgradeGate";
import { useGetAgentVaultAccess } from "@app/hooks/api/agentVault";

export const AgentVaultLayout = () => {
  const { isOpen, setOpen } = useAgentVaultIntro();
  const { data: access } = useGetAgentVaultAccess();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
  const askedForCard = useRef(false);

  // Orgs that used Agent Vault before billing launched keep working; this only asks for a card, once per visit,
  // and waits for the intro so the two never stack.
  useEffect(() => {
    if (!access?.showCardModal || isOpen || askedForCard.current) return;
    askedForCard.current = true;
    openUpgradeGate({
      intent: AgentVaultAddCardUpgradeIntent,
      paywallKey: "agent-vault.grandfathered-card"
    });
  }, [access?.showCardModal, isOpen, openUpgradeGate]);

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <AgentVaultIntroModal isOpen={isOpen} onOpenChange={setOpen} />
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-12 pt-10 pb-4">
        <Outlet />
      </div>
      {upgradeGate}
    </div>
  );
};
