import { useLocation, useNavigate } from "@tanstack/react-router";

import { useOrganization } from "@app/context";

import {
  AgentVaultSetupStep,
  doesAgentVaultSetupStepOpenCreate,
  getAgentVaultSetupStepPath,
  TAgentVaultSetupProgress
} from "./useAgentVaultSetupProgress";

// Goes to the page that owns a step and has that page open its create flow (see
// useAgentVaultCreateIntent).
export const useOpenAgentVaultSetupStep = (
  progress: Pick<TAgentVaultSetupProgress, "hasProxy" | "newestBundle">
) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { currentOrg } = useOrganization();

  return (step: AgentVaultSetupStep) => {
    const path = `/organizations/${currentOrg.id}/agent-vault/${getAgentVaultSetupStepPath(
      step,
      progress.newestBundle?.id
    )}`;
    const opensCreate = doesAgentVaultSetupStepOpenCreate(step, progress);
    const isHere = pathname === path;
    if (isHere && !opensCreate) return;
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: path as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      search: (opensCreate ? { create: true } : {}) as any,
      // The same URL again would push a duplicate history entry.
      replace: isHere
    });
  };
};
