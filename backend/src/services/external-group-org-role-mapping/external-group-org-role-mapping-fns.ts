import { OrgMembershipRole, SubscriptionProductCategory, TRoles } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";

import { TRoleDALFactory } from "../role/role-dal";
import { TExternalGroupOrgMembershipRoleMappingDTO } from "./external-group-org-role-mapping-types";

export const constructGroupOrgMembershipRoleMappings = async ({
  mappingsDTO,
  orgId,
  roleDAL,
  licenseService
}: {
  mappingsDTO: TExternalGroupOrgMembershipRoleMappingDTO[];
  roleDAL: TRoleDALFactory;
  licenseService: TLicenseServiceFactory;
  orgId: string;
}) => {
  const plan = await licenseService.getPlan(orgId);

  // prevent setting custom values if not in plan
  if (
    mappingsDTO.some((map) => isCustomOrgRole(map.roleSlug)) &&
    !plan?.get(SubscriptionProductCategory.Platform, "rbac")
  )
    throw new BadRequestError({
      message:
        "Failed to set group organization role mapping due to plan RBAC restriction. Upgrade plan to set custom role mapping."
    });

  const customRoleSlugs = mappingsDTO
    .filter((mapping) => isCustomOrgRole(mapping.roleSlug))
    .map((mapping) => mapping.roleSlug);

  let customRolesMap: Map<string, TRoles> = new Map();
  if (customRoleSlugs.length > 0) {
    const customRoles = await roleDAL.find({
      orgId,
      $in: {
        slug: customRoleSlugs
      }
    });

    customRolesMap = new Map(customRoles.map((role) => [role.slug, role]));
  }

  const mappings = mappingsDTO.map(({ roleSlug, groupName }) => {
    if (isCustomOrgRole(roleSlug)) {
      const customRole = customRolesMap.get(roleSlug);

      if (!customRole) throw new NotFoundError({ message: `Custom role ${roleSlug} not found.` });

      return {
        groupName,
        role: OrgMembershipRole.Custom,
        roleId: customRole.id,
        orgId
      };
    }

    return {
      groupName,
      role: roleSlug,
      roleId: null, // need to set explicitly null for updates
      orgId
    };
  });

  return mappings;
};
