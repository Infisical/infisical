import { Outlet } from "@tanstack/react-router";

import {
  AgentVaultIntroModal,
  useAgentVaultIntro
} from "@app/components/agent-vault/AgentVaultIntro";

export const AgentVaultLayout = () => {
  const { isOpen, setOpen } = useAgentVaultIntro();

  return (
    <>
      <AgentVaultIntroModal isOpen={isOpen} onOpenChange={setOpen} />
      <Outlet />
    </>
  );
};
