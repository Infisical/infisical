import { useRouterState } from "@tanstack/react-router";

import { ProjectType } from "@app/hooks/api/projects/types";

// The org-scoped products (PAM, Agent Vault) carry no $projectId in the URL, so their layouts publish
// what they are into route context. Reading that rather than the pathname is what keeps this in step
// with useParams, which every other product's gate already uses: the router changes location before it
// swaps matches, so a pathname read answers yes on the way in and no on the way out a frame early, and
// anything gated on it mounts or unmounts out of step with the project it needs.
export const useImplicitProduct = (): ProjectType | null =>
  useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const { implicitProductType } = state.matches[i].context;
        if (implicitProductType) return implicitProductType;
      }
      return null;
    }
  });
