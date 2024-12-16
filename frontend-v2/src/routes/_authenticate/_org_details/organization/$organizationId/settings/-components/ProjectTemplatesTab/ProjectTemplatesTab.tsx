import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { ProjectTemplatesSection } from "./components";

export const ProjectTemplatesTab = withPermission(() => <ProjectTemplatesSection />, {
  action: OrgPermissionActions.Read,
  subject: OrgPermissionSubjects.ProjectTemplates
});
