import { Outlet } from "@tanstack/react-router";

import {
  AgentVaultIntroModal,
  useAgentVaultIntro
} from "@app/components/agent-vault/AgentVaultIntro";
import { useProjectPermission } from "@app/context";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const AgentVaultLayout = () => {
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { isOpen, setOpen } = useAgentVaultIntro();

  return (
    <>
      {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
      <AgentVaultIntroModal isOpen={isOpen} onOpenChange={setOpen} />
      <Outlet />
    </>
  );
};
