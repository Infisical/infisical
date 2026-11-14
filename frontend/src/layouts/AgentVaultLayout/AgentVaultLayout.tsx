import { Outlet } from "@tanstack/react-router";

import {
  AgentVaultIntroModal,
  useAgentVaultIntro
} from "@app/components/agent-vault/AgentVaultIntro";
import { AgentVaultFreeUsageNotice } from "@app/components/agent-vault/FreeUsage";

export const AgentVaultLayout = () => {
  const { isOpen, setOpen } = useAgentVaultIntro();

  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden">
      <AgentVaultIntroModal isOpen={isOpen} onOpenChange={setOpen} />
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-12 pt-10 pb-4">
        <AgentVaultFreeUsageNotice />
        <Outlet />
      </div>
    </div>
  );
};
