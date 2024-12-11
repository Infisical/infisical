import { Workspace } from "@app/hooks/api/types";
import { ProjectType } from "@app/hooks/api/workspace/types";

export const getWorkspaceHomePage = (workspace: Workspace) => {
  if (workspace.type === ProjectType.SecretManager) {
    return `/${workspace.type}/${workspace.id}/secrets/overview`;
  }
  if (workspace.type === ProjectType.CertificateManager) {
    return `/${workspace.type}/${workspace.id}/certificates`;
  }
  return `/${workspace.type}/${workspace.id}/kms`;
};
