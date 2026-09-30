import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";

import { CertificateAlertsCard } from "../../components/CertificateAlerts/CertificateAlertsCard";
import { CertificateAlertScopeKind } from "../../components/CertificateAlerts/types";

export const AlertsTab = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  return (
    <CertificateAlertsCard
      projectId={currentProject.id}
      scope={{ kind: CertificateAlertScopeKind.CertificateManager }}
      canCreate={permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts)}
      canEdit={permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts)}
      canDelete={permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts)}
    />
  );
};
