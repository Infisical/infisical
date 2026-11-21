import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  AgentVaultSetupStep,
  getAgentVaultSetupStepLink,
  useAgentVaultSetupProgress
} from "@app/components/agent-vault/SetupChecklist";
import { PageLoader } from "@app/components/v3";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import {
  canReadAgentVaultAccessBundles,
  canReadAgentVaultServices,
  canReadAgentVaultSessions
} from "@app/helpers/agentVaultPermissions";

// Until setup is finished (or the checklist hidden), someone who can set Agent Vault up lands on the first unfinished
// step. If the progress can't be read, it opens on Sessions as it did before the checklist existed, or for a role that
// can't read sessions, on the first page it can read. Everyone can read Variables, which holds their own.
const AgentVaultIndexRedirect = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const { canSetUp, isLoaded, isFailed, isVisible, nextStep, newestBundle } =
    useAgentVaultSetupProgress();
  const isResolved = !canSetUp || isLoaded || isFailed;

  useEffect(() => {
    if (!isResolved) return;
    const step = isVisible && nextStep ? nextStep : AgentVaultSetupStep.Session;
    if (step === AgentVaultSetupStep.Session && !canReadAgentVaultSessions(permission)) {
      const params = { orgId: currentOrg.id, projectId };
      if (canReadAgentVaultAccessBundles(permission)) {
        navigate({
          to: "/organizations/$orgId/projects/agent-vault/$projectId/access-bundles",
          params,
          replace: true
        });
      } else if (canReadAgentVaultServices(permission)) {
        navigate({
          to: "/organizations/$orgId/projects/agent-vault/$projectId/services",
          params,
          replace: true
        });
      } else {
        navigate({
          to: "/organizations/$orgId/projects/agent-vault/$projectId/variables",
          params,
          replace: true
        });
      }
      return;
    }
    navigate({
      ...getAgentVaultSetupStepLink(step, currentOrg.id, projectId, newestBundle?.id),
      replace: true
    });
  }, [isResolved]);

  return <PageLoader />;
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/agent-vault/$projectId/_agent-vault-layout/"
)({
  component: AgentVaultIndexRedirect
});
