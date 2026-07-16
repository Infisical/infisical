import { ProjectPermissionSub, useProject } from "@app/context";
import { ProjectPermissionIdentityActions } from "@app/context/ProjectPermissionContext/types";
import { withProjectPermission } from "@app/hoc";
import { AlarmsPage as AlarmsView } from "@app/views/AlarmsPage";

const ProjectAlarmsPage = () => {
  const { currentProject } = useProject();
  return (
    <AlarmsView
      projectId={currentProject.id}
      scopeName={currentProject.name}
      scope={currentProject.type}
    />
  );
};

export const AlarmsPage = withProjectPermission(ProjectAlarmsPage, {
  action: ProjectPermissionIdentityActions.Read,
  subject: ProjectPermissionSub.Identity
});
