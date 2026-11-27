import { OrgMembershipRole } from "@app/db/schemas";
import { EntityNotFoundError } from "@app/domains/lib/errors";
import { Grant, TPermissionRule } from "@app/domains/platform/access-control/ce/module";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet
} from "./permissions/org-permission-set";

type TOrgRule = TPermissionRule<OrgPermissionSet>;

const BUILT_IN_ROLES: Record<string, TOrgRule[]> = {
  [OrgMembershipRole.Admin]: orgAdminPermissions,
  [OrgMembershipRole.Member]: orgMemberPermissions,
  [OrgMembershipRole.NoAccess]: orgNoAccessPermissions
};

export class OrgRoles {
  // Throws on a slug that's neither built-in nor custom.
  static rulesFor(grant: Grant): TOrgRule[] {
    if (grant.isCustom()) return grant.customRules<TOrgRule>();
    const slug = grant.builtInSlug() as string;
    const rules = BUILT_IN_ROLES[slug];
    if (!rules)
      throw new EntityNotFoundError({ name: "OrgRoleInvalid", message: `Organization role '${slug}' not found` });
    return rules;
  }
}
