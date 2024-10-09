import { OrgMembershipRole } from "@app/db/schemas";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TOrgRoleDALFactory } from "@app/services/org/org-role-dal";

const RESERVED_ORG_ROLE_SLUGS = Object.values(OrgMembershipRole).filter((role) => role !== "custom");

// this is only for updating an org
export const getDefaultOrgMembershipRoleForUpdateOrg = async ({
  membershipRoleSlug,
  orgRoleDAL,
  plan,
  orgId
}: {
  orgId: string;
  membershipRoleSlug: string;
  orgRoleDAL: TOrgRoleDALFactory;
  plan: TFeatureSet;
}) => {
  const isCustomRole = !RESERVED_ORG_ROLE_SLUGS.includes(membershipRoleSlug as OrgMembershipRole);

  if (isCustomRole) {
    if (!plan?.rbac)
      throw new BadRequestError({
        message:
          "Failed to set custom default role due to plan RBAC restriction. Upgrade plan to set custom default org membership role."
      });

    const customRole = await orgRoleDAL.findOne({ slug: membershipRoleSlug, orgId });
    if (!customRole) throw new NotFoundError({ name: "UpdateOrg", message: "Organization role not found" });

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
  const isCustomRole = !RESERVED_ORG_ROLE_SLUGS.includes(defaultOrgMembershipRole as OrgMembershipRole);

  if (isCustomRole)
    return {
      roleId: defaultOrgMembershipRole,
      role: OrgMembershipRole.Custom
    };

  // will be reserved slug
  return { roleId: undefined, role: defaultOrgMembershipRole as OrgMembershipRole };
};
