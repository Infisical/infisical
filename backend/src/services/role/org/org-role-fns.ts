import { packRules } from "@casl/ability/extra";

import { OrgMembershipRole } from "@app/db/schemas";
import {
  INVALID_SUBORG_PERMISSION_SUBJECTS,
  orgMemberPermissions,
  orgNoAccessPermissions
} from "@app/ee/services/permission/org-permission";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const packPerms = (rules: unknown) => JSON.stringify((packRules as (r: any) => unknown[])(rules));

const packedOrgMember = packPerms(orgMemberPermissions);
const packedOrgNoAccess = packPerms(orgNoAccessPermissions);

const invalidSubjects = new Set<string>(INVALID_SUBORG_PERMISSION_SUBJECTS);
const packedSubOrgMember = packPerms(orgMemberPermissions.filter((r) => !invalidSubjects.has(r.subject as string)));

export const getOrgBuiltInRoles = (orgId: string, opts?: { isSubOrg?: boolean }) => {
  const memberPerms = opts?.isSubOrg ? packedSubOrgMember : packedOrgMember;

  return [
    {
      orgId,
      name: "Member",
      slug: OrgMembershipRole.Member,
      description: "Members can read and create projects inside the organization.",
      permissions: memberPerms,
      isBuiltIn: true
    },
    {
      orgId,
      name: "No Access",
      slug: OrgMembershipRole.NoAccess,
      description: "No access to organization resources.",
      permissions: packedOrgNoAccess,
      isBuiltIn: true
    }
  ];
};
