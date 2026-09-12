import { useLocation, useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { getOrgScopedProductFromPath } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

export type ScopeVariant = "org" | "project" | "sub-org" | "av";

/**
 * Returns the scope-coloured variant to pass to v3 components (Button, TabsList, IconButton, etc.) so
 * they match the surrounding page chrome. An org-scoped product has no projectId in its URL, so it is
 * read from the pathname instead, or its pages would take the org colour.
 */
export const useScopeVariant = (): ScopeVariant => {
  const { projectId } = useParams({ strict: false });
  const { pathname } = useLocation();
  const { isSubOrganization } = useOrganization();

  if (getOrgScopedProductFromPath(pathname) === ProjectType.AgentVault) return "av";
  if (projectId) return "project";
  if (isSubOrganization) return "sub-org";
  return "org";
};
