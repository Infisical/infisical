import { ProjectType, ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import type { TProjectsDomain, TResourceRoles } from "@app/domains/platform/projects/ce/module";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import {
  applicationAdminPermissions,
  applicationAuditorPermissions,
  applicationOperatorPermissions,
  ApplicationPermissionSet,
  projectAdminApplicationFallbackPermissions
} from "./application-roles";

const APPLICATION_ROLES: Record<string, typeof applicationAdminPermissions> = {
  [ResourceMembershipRole.Admin]: applicationAdminPermissions,
  [ResourceMembershipRole.Operator]: applicationOperatorPermissions,
  [ResourceMembershipRole.Auditor]: applicationAuditorPermissions
};

export const applicationRoles: TResourceRoles<ApplicationPermissionSet> = {
  resolveRole: (role) => {
    if (role === ResourceMembershipRole.Custom) {
      throw new BadRequestError({ message: "Custom resource-level roles are not supported yet" });
    }
    const rules = APPLICATION_ROLES[role];
    if (!rules) {
      throw new NotFoundError({ name: "ApplicationRoleInvalid", message: `Application role '${role}' not found` });
    }
    return rules;
  },
  projectAdminFallback: projectAdminApplicationFallbackPermissions
};

// What the actor may do on one certificate application: its application role, plus the fallback set when it is a
// project admin.
export const getApplicationPermission = (
  projectsDomain: Pick<TProjectsDomain, "getProjectResourcePermission">,
  { actor, projectId, applicationId }: { actor: TActorContext; projectId: string; applicationId: string }
) =>
  projectsDomain.getProjectResourcePermission<ApplicationPermissionSet>({
    actor,
    projectId,
    type: ProjectType.CertificateManager,
    resources: [{ resourceType: ResourceType.CertificateApplication, resourceId: applicationId }],
    roles: applicationRoles
  });
