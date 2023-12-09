import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

import {
  conditionsMatcher,
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionSet
} from "./org-permission";
import { TPermissionDalFactory } from "./permission-dal";

import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";

type TPermissionServiceFactoryDep = {
  permissionDal: TPermissionDalFactory;
};

export type TPermissionServiceFactory = ReturnType<typeof permissionServiceFactory>;

export const permissionServiceFactory = ({ permissionDal }: TPermissionServiceFactoryDep) => {
  /*
   * Get user permission in an organization
   * */
  const getUserOrgPermission = async (userId: string, orgId: string) => {
    const membership = await permissionDal.getOrgPermission(userId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === "custom" && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    if (membership.role === "admin") return { permission: orgAdminPermissions, membership };
    if (membership.role === "member") return { permission: orgMemberPermissions, membership };
    if (membership.role === "custom") {
      const permission = createMongoAbility<OrgPermissionSet>(
        // akhilmhdh: putting any due to ts incompatiable matching with string and the other
        unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(membership.permissions as any),
        {
          conditionsMatcher
        }
      );
      return { permission, membership };
    }

    throw new BadRequestError({ name: "Role missing", message: "User role not found" });
  };

  return {
    getUserOrgPermission
  };
};
