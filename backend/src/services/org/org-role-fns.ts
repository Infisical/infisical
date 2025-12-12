import { OrgMembershipRole } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TRoleDALFactory } from "../role/role-dal";

const RESERVED_ORG_ROLE_SLUGS = Object.values(OrgMembershipRole).filter((role) => role !== "custom");

export const isCustomOrgRole = (roleSlug: string) => !RESERVED_ORG_ROLE_SLUGS.find((r) => r === roleSlug);

// this is only for updating an org
export const getDefaultOrgMembershipRoleForUpdateOrg = async ({
  membershipRoleSlug,
  roleDAL,
  rbac,
  orgId
}: {
  orgId: string;
  membershipRoleSlug: string;
  roleDAL: TRoleDALFactory;
  rbac?: boolean;
}) => {
  if (isCustomOrgRole(membershipRoleSlug)) {
    if (!rbac)
      throw new BadRequestError({
        message:
          "Failed to set custom default role due to plan RBAC restriction. Upgrade plan to set custom default org membership role."
      });

    const customRole = await roleDAL.findOne({ slug: membershipRoleSlug, orgId });
    if (!customRole) {
      throw new NotFoundError({
        name: "UpdateOrg",
        message: `Organization role with slug '${membershipRoleSlug}' not found`
      });
    }

    // use ID for default role
    return customRole.id;
  }

  // not custom, use reserved slug
  return membershipRoleSlug;
};

// this is only for creating an org membership
export const getDefaultOrgMembershipRole = async (
  defaultOrgMembershipRole: string // can either be ID or reserved slug
) => {
  if (isCustomOrgRole(defaultOrgMembershipRole))
    return {
      roleId: defaultOrgMembershipRole,
      role: OrgMembershipRole.Custom
    };

  // will be reserved slug
  return { roleId: undefined, role: defaultOrgMembershipRole as OrgMembershipRole };
};
