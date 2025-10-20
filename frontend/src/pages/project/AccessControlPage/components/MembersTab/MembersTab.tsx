import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { MembersSection } from "./components";

export const MembersTab = withProjectPermission(
  () => {
    return <MembersSection />;
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Member
  }
);
