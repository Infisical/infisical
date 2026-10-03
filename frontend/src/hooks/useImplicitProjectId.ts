import { useRouterState } from "@tanstack/react-router";

// PAM and Agent Vault carry no $projectId in the URL, so their layouts publish the id they resolved in
// beforeLoad. Every gate that decides whether a useProject caller renders reads the matched routes too
// (see useImplicitProduct), so the id and the gate move together.
export const useImplicitProjectId = () =>
  useRouterState({
    select: (state) => {
      for (let i = state.matches.length - 1; i >= 0; i -= 1) {
        const { implicitProjectId } = state.matches[i].context;
        if (implicitProjectId) return implicitProjectId;
      }
      return null;
    }
  });
