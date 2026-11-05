import { useMatchRoute, useNavigate } from "@tanstack/react-router";

import { useOrganization } from "@app/context";

import {
  AgentVaultSetupStep,
  doesAgentVaultSetupStepOpenCreate,
  getAgentVaultSetupStepLink,
  TAgentVaultSetupProgress
} from "./useAgentVaultSetupProgress";

// Goes to the page that owns a step and has that page open its create flow (see
// useAgentVaultCreateIntent).
export const useOpenAgentVaultSetupStep = (
  progress: Pick<TAgentVaultSetupProgress, "hasProxy" | "newestBundle">
) => {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const { currentOrg } = useOrganization();

  return (step: AgentVaultSetupStep) => {
    const link = getAgentVaultSetupStepLink(step, currentOrg.id, progress.newestBundle?.id);
    const opensCreate = doesAgentVaultSetupStepOpenCreate(step, progress);
    const isHere = Boolean(matchRoute(link));
    if (isHere && !opensCreate) return;
    navigate({
      ...link,
      search: opensCreate ? { create: true } : undefined,
      // The same URL again would push a duplicate history entry.
      replace: isHere
    });
  };
};
