import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionCertificateActions } from "@app/context/ProjectPermissionContext/types";

import { ApplicationAlertsCard } from "../../ApplicationDetailsByIDPage/components/ApplicationAlerts/ApplicationAlertsCard";
import { CertificateAlertScopeKind } from "../../ApplicationDetailsByIDPage/components/ApplicationAlerts/types";

export const AlertsTab = () => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();

  const certificateReadRules = permission.rulesFor(
    ProjectPermissionCertificateActions.Read,
    ProjectPermissionSub.Certificates
  );
  const canReadAllCertificates =
    certificateReadRules.some((rule) => !rule.inverted && !rule.conditions) &&
    !certificateReadRules.some((rule) => rule.inverted);

  return (
    <ApplicationAlertsCard
      projectId={currentProject.id}
      scope={{ kind: CertificateAlertScopeKind.CertificateManager }}
      canCreate={
        canReadAllCertificates &&
        permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts)
      }
      canEdit={
        canReadAllCertificates &&
        permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts)
      }
      canDelete={permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts)}
    />
  );
};
