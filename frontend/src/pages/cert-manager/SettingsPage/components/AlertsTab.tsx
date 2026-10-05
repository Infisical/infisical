import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { CertificateAlertsCard } from "@app/pages/cert-manager/components/CertificateAlerts/CertificateAlertsCard";
import { CertificateAlertScopeKind } from "@app/pages/cert-manager/components/CertificateAlerts/types";

export const AlertsTab = () => {
  const { currentProject } = useProject();
  const { permission, hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <CertificateAlertsCard
      projectId={currentProject.id}
      scope={{ kind: CertificateAlertScopeKind.CertificateManager }}
      canCreate={
        isAdmin && permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts)
      }
      canEdit={isAdmin && permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts)}
      canDelete={permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts)}
    />
  );
};
