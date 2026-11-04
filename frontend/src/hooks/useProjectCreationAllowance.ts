import {
  AgentVaultProjectLimitUpgradeIntent,
  ProjectLimitUpgradeIntent
} from "@app/components/license/UpgradeGate";
import { useOrganization, useSubscription } from "@app/context";
import { useGetOrgProductStats } from "@app/hooks/api/organization/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

const DEFAULT_AGENT_VAULT_PROJECT_LIMIT = 3;

// A plan cached before the field existed has no value, which the server treats as the default.
export const getAgentVaultProjectLimit = (subscription?: SubscriptionPlan) =>
  subscription?.agentVaultProjectLimit === undefined
    ? DEFAULT_AGENT_VAULT_PROJECT_LIMIT
    : subscription.agentVaultProjectLimit;

// Agent Vault projects have their own cap and don't count toward the plan's project limit. Until the
// count loads, creation stays open: the server refuses a project over the cap either way.
export const useProjectCreationAllowance = (projectType?: ProjectType | null) => {
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const isAgentVault = projectType === ProjectType.AgentVault;
  const { data: productStats } = useGetOrgProductStats(isAgentVault ? currentOrg.id : "");

  if (isAgentVault) {
    const limit = getAgentVaultProjectLimit(subscription);
    const projectsCount = productStats?.agentVault.projectsCount;
    return {
      isAddingProjectsAllowed:
        limit === null || projectsCount === undefined || projectsCount < limit,
      upgradeIntent: AgentVaultProjectLimitUpgradeIntent
    };
  }

  return {
    isAddingProjectsAllowed: subscription?.workspaceLimit
      ? subscription.workspacesUsed < subscription.workspaceLimit
      : true,
    upgradeIntent: ProjectLimitUpgradeIntent
  };
};
