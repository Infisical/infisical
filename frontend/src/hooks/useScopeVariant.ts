import { useParams } from "@tanstack/react-router";

import { useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useActiveProduct } from "./useActiveProduct";

export type ScopeVariant = "org" | "project" | "sub-org" | "av" | "ss";

/**
 * Returns the scope-coloured variant to pass to v3 components (Button, TabsList, IconButton, etc.) so
 * they match the surrounding page chrome. The `project` variant takes the active product's colour from
 * `--color-project`; Agent Vault and Secret Scanning keep their own stronger-tinted variants.
 */
export const useScopeVariant = (): ScopeVariant => {
  const { projectId } = useParams({ strict: false });
  const { isSubOrganization } = useOrganization();
  const activeProduct = useActiveProduct();

  if (activeProduct === ProjectType.AgentVault) return "av";
  if (activeProduct === ProjectType.SecretScanning) return "ss";
  if (projectId || activeProduct) return "project";
  if (isSubOrganization) return "sub-org";
  return "org";
};
