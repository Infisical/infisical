import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import { AlertsPage as AlertsView } from "@app/views/AlertsPage";

const ProjectAlertsPage = () => {
  const { currentProject } = useProject();
  return (
    <AlertsView
      projectId={currentProject.id}
      scopeName={currentProject.name}
      scope={currentProject.type}
    />
  );
};

export const AlertsPage = withProjectPermission(ProjectAlertsPage, {
  action: ProjectPermissionIdentityActions.Read,
  subject: ProjectPermissionSub.Identity
});
