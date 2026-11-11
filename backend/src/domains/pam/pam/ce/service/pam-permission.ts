import { ProjectType, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TProjectsDomain, TResourceRef, TResourceRoles } from "@app/domains/platform/projects/ce/module";
import { NotFoundError } from "@app/lib/errors";

import {
  pamResourceAdminPermissions,
  pamResourceAuditorPermissions,
  pamResourceConnectorPermissions,
  pamResourceOperatorPermissions,
  PamResourcePermissionSet
} from "./pam-roles";

// The roles a PAM folder or account membership holds (PamResourceRole in ee/services/pam/pam-enums.ts).
const PAM_RESOURCE_ROLES: Record<string, typeof pamResourceAdminPermissions> = {
  admin: pamResourceAdminPermissions,
  operator: pamResourceOperatorPermissions,
  connector: pamResourceConnectorPermissions,
  auditor: pamResourceAuditorPermissions
};

export const pamResourceRoles: TResourceRoles<PamResourcePermissionSet> = {
  resolveRole: (role) => {
    const rules = PAM_RESOURCE_ROLES[role];
    if (!rules) throw new NotFoundError({ name: "PamRoleInvalid", message: `PAM role '${role}' not found` });
    return rules;
  },
  // A PAM project admin administers the product, not each folder: it gets nothing on a folder it has no role on.
  projectAdminFallback: []
};

// What the actor may do on a PAM folder, an account, or an account in a folder: the roles it holds on either,
// together. isProjectAdmin on the result is the product admin.
export const getPamPermission = (
  projectsDomain: Pick<TProjectsDomain, "getProjectResourcePermission">,
  {
    actor,
    projectId,
    folderId,
    accountId
  }: { actor: TActorContext; projectId: string; folderId?: string | null; accountId?: string }
) => {
  const resources: TResourceRef[] = [];
  if (folderId) resources.push({ resourceType: ResourceType.PamFolder, resourceId: folderId });
  if (accountId) resources.push({ resourceType: ResourceType.PamAccount, resourceId: accountId });
  return projectsDomain.getProjectResourcePermission<PamResourcePermissionSet>({
    actor,
    projectId,
    type: ProjectType.PAM,
    resources,
    roles: pamResourceRoles
  });
};
