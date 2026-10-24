import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  getAgentVaultSetupStepPath,
  useAgentVaultSetupProgress
} from "@app/components/agent-vault/SetupChecklist";
import { PageLoader } from "@app/components/v3";
import { useOrganization } from "@app/context";

// Until an admin finishes setup (or hides the checklist), the product opens on the first unfinished step.
// If the progress can't be read, it opens on Sessions as it did before the checklist existed.
const AgentVaultIndexRedirect = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { isAdmin, isLoaded, isFailed, isVisible, nextStep, newestBundle } =
    useAgentVaultSetupProgress();
  const isResolved = !isAdmin || isLoaded || isFailed;

  useEffect(() => {
    if (!isResolved) return;
    const pathSuffix =
      isVisible && nextStep ? getAgentVaultSetupStepPath(nextStep, newestBundle?.id) : "sessions";
    navigate({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to: `/organizations/${currentOrg.id}/agent-vault/${pathSuffix}` as any,
      replace: true
    });
  }, [isResolved]);

  return <PageLoader />;
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/"
)({
  component: AgentVaultIndexRedirect
});
