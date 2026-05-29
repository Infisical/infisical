import { OrgMembershipRole } from "@app/db/schemas";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isUuidV4 } from "@app/lib/validator";

import { TRoleDALFactory } from "../role/role-dal";

// Only admin is a built-in slug; everything else is a custom role
export const isCustomOrgRole = (roleSlug: string) => roleSlug !== OrgMembershipRole.Admin;

// this is only for updating an org
export const getDefaultOrgMembershipRoleForUpdateOrg = async ({
  membershipRoleSlug,
  roleDAL,
  plan,
  orgId
}: {
  orgId: string;
  membershipRoleSlug: string;
  roleDAL: TRoleDALFactory;
  plan: TFeatureSet;
}) => {
  if (membershipRoleSlug === OrgMembershipRole.Admin) return membershipRoleSlug;

  const role = await roleDAL.findOne({ slug: membershipRoleSlug, orgId });
  if (!role) {
    throw new NotFoundError({
      name: "UpdateOrg",
      message: `Organization role with slug '${membershipRoleSlug}' not found`
    });
  }

  // Built-in roles (member, no-access) do not require an enterprise RBAC plan.
  // Only user-created custom roles do.
  if (!role.isBuiltIn) {
    if (!plan?.rbac)
      throw new BadRequestError({
        message:
          "Failed to set custom default role due to plan RBAC restriction. Upgrade plan to set custom default org membership role."
      });
  }

  return role.id;
};

export const getDefaultOrgMembershipRole = async (
  defaultOrgMembershipRole: string, // either "admin", a built-in slug (member/no-access) or a custom role UUID
  { roleDAL, orgId }: { roleDAL: Pick<TRoleDALFactory, "findOne">; orgId: string }
) => {
  if (defaultOrgMembershipRole === OrgMembershipRole.Admin) return { roleId: null, role: OrgMembershipRole.Admin };

  // Built-in (member/no-access) and custom roles are all DB-backed rows referenced via customRoleId.
  // The stored value can be a slug (built-in default) or a role UUID (custom default), so resolve to the row id.
  const role = isUuidV4(defaultOrgMembershipRole)
    ? await roleDAL.findOne({ id: defaultOrgMembershipRole, orgId })
    : await roleDAL.findOne({ slug: defaultOrgMembershipRole, orgId });

  if (!role) {
    throw new NotFoundError({
      name: "OrgMembershipRoleInvalid",
      message: `Organization role '${defaultOrgMembershipRole}' not found`
    });
  }

  return { roleId: role.id, role: OrgMembershipRole.Custom };
};
