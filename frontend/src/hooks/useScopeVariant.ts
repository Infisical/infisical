import { useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";

export type ScopeVariant = "org" | "project" | "sub-org";

/**
 * Returns the scope-coloured variant ("org" | "project" | "sub-org") to pass to
 * v3 components (Button, TabsList, IconButton, etc.) so they match the
 * surrounding page chrome.
 */
export const useScopeVariant = (): ScopeVariant => {
  const { projectId } = useParams({ strict: false });
  const { isSubOrganization } = useOrganization();

  if (projectId) return "project";
  if (isSubOrganization) return "sub-org";
  return "org";
};
