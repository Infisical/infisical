import { RawRule } from "@casl/ability";

import { ProjectPermissionSub } from "@app/ee/services/permission/project-permission";

export const shouldCheckFolderPermission = (rules: RawRule[]) =>
  rules.some((rule) => (rule.subject as ProjectPermissionSub[]).includes(ProjectPermissionSub.SecretFolders));
