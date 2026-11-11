import { OrgMembershipRole } from "@app/db/schemas";
import { TPermissionRule } from "@app/domains/platform/access-control/ce/module";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet
} from "./permission/org-permission";

// The built-in org roles by slug.
export const ORG_ROLES: Record<string, TPermissionRule<OrgPermissionSet>[]> = {
  [OrgMembershipRole.Admin]: orgAdminPermissions,
  [OrgMembershipRole.Member]: orgMemberPermissions,
  [OrgMembershipRole.NoAccess]: orgNoAccessPermissions
};
