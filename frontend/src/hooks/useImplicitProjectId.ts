import { useRouterState } from "@tanstack/react-router";

import { useOrganization } from "@app/context/OrganizationContext";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

// PAM and Agent Vault carry no projectId in the URL, so the id is derived from two sources rather
// than one. The router moves them at different times: location changes first, matches swap after.
// Components gating on the pathname (the sidebar's project nav, the project switcher) therefore mount
// on the leading edge, while the product layout and its breadcrumb unmount on the trailing one.
// Preferring the matched route's id and falling back to the pathname keeps every one of them holding
// an id for the whole transition; either source alone leaves a gap at the end it has already left,
// and useProject throws into ErrorPage there.
export const useImplicitProjectId = () => {
  const { currentOrg } = useOrganization();

  // One subscription with a narrowing select, so the ~100 useProject callers re-render only when the
  // resolved id changes rather than on every location or match change.
  return useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const { implicitProjectId } = state.matches[i].context;
        if (implicitProjectId) return implicitProjectId;
      }

      const product = getOrgScopedProductFromPath(state.location.pathname);
      if (product === ProjectType.PAM) return currentOrg.pamProjectId;
      if (product === ProjectType.AgentVault) return currentOrg.agentVaultProjectId;
      return null;
    }
  });
};
