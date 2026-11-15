import { ProjectLimitUpgradeIntent } from "@app/components/license/UpgradeGate";
import { useSubscription } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

// Agent Vault projects don't count toward the plan's project limit.
export const useProjectCreationAllowance = (projectType?: ProjectType | null) => {
  const { subscription } = useSubscription();

  if (projectType === ProjectType.AgentVault) {
    return { isAddingProjectsAllowed: true, upgradeIntent: ProjectLimitUpgradeIntent };
  }

  return {
    isAddingProjectsAllowed: subscription?.workspaceLimit
      ? subscription.workspacesUsed < subscription.workspaceLimit
      : true,
    upgradeIntent: ProjectLimitUpgradeIntent
  };
};
