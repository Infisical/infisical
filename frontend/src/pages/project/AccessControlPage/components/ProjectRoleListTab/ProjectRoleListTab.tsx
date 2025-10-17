import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { ProjectRoleList } from "./components/ProjectRoleList";

export const ProjectRoleListTab = withProjectPermission(
  () => {
    return <ProjectRoleList />;
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role }
);
