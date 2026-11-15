import { Loader } from "@infisical/cipher/ui/loader";
import { Navigate, useParams } from "@tanstack/react-router";

import {
  AgentVaultSetupStep,
  agentVaultSetupStepLink,
  useAgentVaultSetupProgress
} from "./setup-progress";

export const AgentVaultIndexRedirect = () => {
  const { orgId, projectId } = useParams({
    from: "/v4/organizations/$orgId/projects/agent-vault/$projectId/"
  });
  const { isPermissionLoaded, isAdmin, isLoaded, isFailed, isVisible, nextStep, newestBundle } =
    useAgentVaultSetupProgress(orgId, projectId);

  if (!isPermissionLoaded || (isAdmin && !isLoaded && !isFailed))
    return <Loader size="page" label="Loading Agent Vault" />;

  const step = isVisible && nextStep ? nextStep : AgentVaultSetupStep.Session;
  return (
    <Navigate replace {...agentVaultSetupStepLink(step, orgId, projectId, newestBundle?.id)} />
  );
};
