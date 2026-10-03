import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionCertificateActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ApplicationAlertsCard } from "../../ApplicationDetailsByIDPage/components/ApplicationAlerts/ApplicationAlertsCard";
import {
  CertificateAlertAccess,
  CertificateAlertScopeKind,
  getEventTypesForAccess
} from "../../ApplicationDetailsByIDPage/components/ApplicationAlerts/types";

export const AlertsTab = () => {
  const { currentProject } = useProject();
  const { permission, hasProjectRole } = useProjectPermission();

  const isUnconditionalGrant = (rules: ReturnType<typeof permission.rulesFor>) =>
    rules.some((rule) => !rule.inverted && !rule.conditions) &&
    !rules.some((rule) => rule.inverted);

  const allowedEventTypes = getEventTypesForAccess([
    ...(isUnconditionalGrant(
      permission.rulesFor(
        ProjectPermissionCertificateActions.Read,
        ProjectPermissionSub.Certificates
      )
    )
      ? [CertificateAlertAccess.ReadAllCertificates]
      : []),
    ...(hasProjectRole(ProjectMembershipRole.Admin) ? [CertificateAlertAccess.Admin] : [])
  ]);

  return (
    <ApplicationAlertsCard
      projectId={currentProject.id}
      scope={{ kind: CertificateAlertScopeKind.CertificateManager }}
      allowedEventTypes={allowedEventTypes}
      canCreate={permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.PkiAlerts)}
      canEdit={permission.can(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiAlerts)}
      canDelete={permission.can(ProjectPermissionActions.Delete, ProjectPermissionSub.PkiAlerts)}
    />
  );
};
