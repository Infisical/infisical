import { ProjectType } from "@app/hooks/api/projects/types";

export const shouldShowLegacyAdditionalPrivileges = (
  projectType: ProjectType,
  legacyPrivilegesEnabled: boolean
): boolean => {
  const isStandaloneProduct =
    projectType === ProjectType.CertificateManager ||
    projectType === ProjectType.PAM ||
    projectType === ProjectType.AgentVault;

  return !isStandaloneProduct && legacyPrivilegesEnabled;
};
