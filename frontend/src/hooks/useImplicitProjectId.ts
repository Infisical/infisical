import { useLocation, useRouterState } from "@tanstack/react-router";

import { useOrganization } from "@app/context/OrganizationContext";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

// PAM and Agent Vault carry no projectId in the URL, so the id has to be derived. Two sources are
// consulted because the router moves them at different times: location changes first, matches swap
// after. Components that gate on the pathname (the sidebar's project nav, the project switcher) mount
// on the leading edge, while the product layout and its breadcrumb unmount on the trailing one. Taking
// whichever source still names the product keeps every one of them holding an id for the whole
// transition; reading only one flashes ErrorPage at whichever end that source has already left.
export const useImplicitProjectId = () => {
  const fromMatches = useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const context = state.matches[i].context as { implicitProjectId?: string } | undefined;
        if (context?.implicitProjectId) return context.implicitProjectId;
      }
      return null;
    }
  });

  // Selecting on the derived product keeps the ~100 useProject callers from re-rendering on every
  // search-param change.
  const product = useLocation({
    select: (location) => getOrgScopedProductFromPath(location.pathname)
  });
  const { currentOrg } = useOrganization();

  if (fromMatches) return fromMatches;
  if (product === ProjectType.PAM) return currentOrg.pamProjectId;
  if (product === ProjectType.AgentVault) return currentOrg.agentVaultProjectId;
  return null;
};
