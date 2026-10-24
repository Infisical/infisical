import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { useAgentVaultSetupProgress } from "@app/components/agent-vault/SetupChecklist";
import { PageLoader } from "@app/components/v3";
import { useOrganization } from "@app/context";

// Until an admin finishes setup (or hides the checklist), the product opens on the first unfinished step.
const AgentVaultIndexRedirect = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const progress = useAgentVaultSetupProgress();
  const { isAdmin, isLoaded, isVisible, hasConnectedProxy, newestBundle, hasService } = progress;
  const isResolved = !isAdmin || isLoaded;

  useEffect(() => {
    if (!isResolved) return;
    const params = { orgId: currentOrg.id };

    if (isVisible && !hasConnectedProxy) {
      navigate({ to: "/organizations/$orgId/agent-vault/proxies", params, replace: true });
    } else if (isVisible && !newestBundle) {
      navigate({ to: "/organizations/$orgId/agent-vault/access-bundles", params, replace: true });
    } else if (isVisible && newestBundle && !hasService) {
      navigate({
        to: "/organizations/$orgId/agent-vault/access-bundles/$accessBundleId",
        params: { ...params, accessBundleId: newestBundle.id },
        replace: true
      });
    } else {
      navigate({ to: "/organizations/$orgId/agent-vault/sessions", params, replace: true });
    }
  }, [isResolved]);

  return <PageLoader />;
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout/"
)({
  component: AgentVaultIndexRedirect
});
