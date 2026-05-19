import { ProjectPermissionSub } from "@app/context/ProjectPermissionContext";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  EXCLUDED_PERMISSION_SUBS,
  PROJECT_PERMISSION_OBJECT,
  ProjectTypePermissionSubjects
} from "@app/pages/project/RoleDetailsBySlugPage/components/ProjectRoleModifySection.utils";

import { SubjectDescriptor } from "./permission-audit.types";

/**
 * Returns the ordered list of subjects shown by the role-editing page for the
 * given project type, with each subject's title, description, and native
 * actions. The audit sheet renders the same set 1:1 so that what users see
 * here matches what they configure in role policies.
 */
export const getAuditSubjects = (projectType: ProjectType): SubjectDescriptor[] => {
  const subjects = Object.keys(PROJECT_PERMISSION_OBJECT) as ProjectPermissionSub[];
  return subjects
    .filter((subject) => !EXCLUDED_PERMISSION_SUBS.includes(subject))
    .filter((subject) => ProjectTypePermissionSubjects[projectType]?.[subject])
    .map((subject) => {
      const entry = PROJECT_PERMISSION_OBJECT[subject];
      return {
        subject,
        label: entry.title,
        description: entry.description,
        actions: entry.actions.map((a) => ({
          action: String(a.value),
          label: a.label,
          description: a.description,
          isLegacy: /\(legacy\)/i.test(a.label)
        }))
      };
    });
};
