import { useLocation } from "@tanstack/react-router";

import { useOrganization } from "@app/context/OrganizationContext";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

// Org-scoped products (PAM, Agent Vault) run over one implicit project and carry no $projectId in
// the URL, so their project id is resolved from the current org by the product in the path. Selecting
// on the derived product keeps the ~100 useProject/useProjectPermission callers from re-rendering on
// every search-param change.
export const useImplicitProjectId = () => {
  const product = useLocation({
    select: (location) => getOrgScopedProductFromPath(location.pathname)
  });
  const { currentOrg } = useOrganization();

  if (product === ProjectType.PAM) return currentOrg.pamProjectId;
  if (product === ProjectType.AgentVault) return currentOrg.agentVaultProjectId;
  return null;
};
