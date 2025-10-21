import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { GroupsSection } from "./components";

export const GroupsTab = withProjectPermission(
  () => {
    return <GroupsSection />;
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Groups
  }
);
