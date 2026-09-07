import { useLocation } from "@tanstack/react-router";

import { useOrganization } from "@app/context/OrganizationContext";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

// Selecting on the derived product keeps the ~100 useProject callers from re-rendering on every
// search-param change.
export const useImplicitProjectId = () => {
  const product = useLocation({
    select: (location) => getOrgScopedProductFromPath(location.pathname)
  });
  const { currentOrg } = useOrganization();

  if (product === ProjectType.PAM) return currentOrg.pamProjectId;
  if (product === ProjectType.AgentVault) return currentOrg.agentVaultProjectId;
  return null;
};
