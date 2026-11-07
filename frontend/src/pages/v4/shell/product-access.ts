import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useOrgPermission } from "../access/permissions";
import { useV4Adapter } from "../data/adapters";
import { useV4Session } from "../data/session/contract";

export const useBlockedProducts = (orgId: string): ReadonlySet<ProjectType> => {
  const { projects } = useV4Session();
  const { permission, isPending } = useOrgPermission();
  const { data: organization } = useV4Adapter("org").useOrganization(orgId);
  const { data: certManager } = useV4Adapter("certificates").useInstanceState(orgId);
  const { data: secretScanning } = useV4Adapter("secretScanning").useInstanceState(orgId);
  const blocked = new Set<ProjectType>();
  if (
    isPending ||
    permission.can(
      OrgPermissionAdminConsoleAction.AccessAllProjects,
      OrgPermissionSubjects.AdminConsole
    ) ||
    permission.can(OrgPermissionProjectActions.RequestAccess, OrgPermissionSubjects.Project)
  )
    return blocked;
  const isMember = (projectId?: string | null) =>
    Boolean(projectId && projects.some((project) => project.id === projectId));
  const certManagerProjects = certManager?.projects ?? [];
  if (
    certManagerProjects.length > 0 &&
    !certManagerProjects.some((project) => isMember(project.id))
  )
    blocked.add(ProjectType.CertificateManager);
  if (organization?.pamProjectId && !isMember(organization.pamProjectId))
    blocked.add(ProjectType.PAM);
  if (secretScanning?.activeProjectId && !isMember(secretScanning.activeProjectId))
    blocked.add(ProjectType.SecretScanning);
  return blocked;
};
