import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet
} from "./org-permission-set";

type TOrgRule = TPermissionRule<OrgPermissionSet>;

const BUILT_IN_ROLES: Record<string, TOrgRule[]> = {
  [OrgMembershipRole.Admin]: orgAdminPermissions,
  [OrgMembershipRole.Member]: orgMemberPermissions,
  [OrgMembershipRole.NoAccess]: orgNoAccessPermissions
};

// What org roles grant: the built-in ones as defined, a custom role or privilege as its own rules.
export class OrgRoles {
  static isBuiltIn(slug: string): boolean {
    return Object.hasOwn(BUILT_IN_ROLES, slug);
  }

  // Refuses a slug that is neither built in nor custom.
  static rulesFor(grant: Grant): TOrgRule[] {
    if (grant.isCustom()) return grant.customRules<TOrgRule>();
    const slug = grant.builtInSlug() as string;
    const rules = BUILT_IN_ROLES[slug];
    if (!rules)
      throw new EntityNotFoundError({ name: "OrgRoleInvalid", message: `Organization role '${slug}' not found` });
    return rules;
  }
}
