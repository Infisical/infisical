import { ResourceMembershipRole, ResourceType } from "@app/db/schemas";
import { EntityNotFoundError, RuleViolationError } from "@app/domains/lib/errors";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";
import { TResourceRoles } from "@app/domains/platform/projects/ce/module";

import {
  applicationAdminPermissions,
  applicationAuditorPermissions,
  applicationOperatorPermissions,
  ApplicationPermissionSet,
  projectAdminApplicationFallbackPermissions
} from "./application-roles";

type TApplicationRule = TPermissionRule<ApplicationPermissionSet>;

// What the roles held on a certificate application grant.
export class ApplicationRoles implements TResourceRoles<ApplicationPermissionSet> {
  readonly resourceType = ResourceType.CertificateApplication;

  private readonly builtInRoles = new Map<string, TApplicationRule[]>([
    [ResourceMembershipRole.Admin, applicationAdminPermissions],
    [ResourceMembershipRole.Operator, applicationOperatorPermissions],
    [ResourceMembershipRole.Auditor, applicationAuditorPermissions]
  ]);

  private readonly adminRules = projectAdminApplicationFallbackPermissions;

  rulesFor(grant: Grant): TApplicationRule[] {
    if (grant.isCustom()) {
      throw new RuleViolationError({ message: "Custom resource-level roles are not supported yet" });
    }
    const slug = grant.builtInSlug() as string;
    const rules = this.builtInRoles.get(slug);
    if (!rules) {
      throw new EntityNotFoundError({
        name: "ApplicationRoleInvalid",
        message: `Application role '${slug}' not found`
      });
    }
    return rules;
  }

  projectAdminRules(): TApplicationRule[] {
    return this.adminRules;
  }
}
