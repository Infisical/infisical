import { ProjectMembershipRole } from "@app/db/schemas";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import {
  conditionsMatcher,
  orgAdminPermissions,
  orgMemberPermissions,
  OrgPermissionSet
} from "./org-permission";
import { TPermissionDalFactory } from "./permission-dal";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission} from "./project-permission";

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

  // user permission for a project in an organization
  const getUserProjectPermission = async (userId: string, projectId: string) => {
    const membership = await permissionDal.getProjectPermission(userId, projectId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === "custom" && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    if (membership.role === ProjectMembershipRole.Admin)
      return { permission: projectAdminPermissions, membership };
    if (membership.role === ProjectMembershipRole.Member)
      return { permission: projectMemberPermissions, membership };
    if (membership.role === ProjectMembershipRole.Viewer)
      return { permission: projectViewerPermission, membership };
    if (membership.role === ProjectMembershipRole.NoAccess)
      return { permission: projectNoAccessPermissions, membership };
    if (membership.role === ProjectMembershipRole.Custom) {
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

  const getProjectPermission = async (type: ActorType, id: string, projectId: string) => {
    switch (type) {
      case ActorType.USER:
        return getUserProjectPermission(id, projectId);
      default:
        throw new UnauthorizedError({
          message: "Permission not defined",
          name: "Get org permission"
        });
    }
  };

  const getOrgPermission = async (type: ActorType, id: string, orgId: string) => {
    switch (type) {
      case ActorType.USER:
        return getUserOrgPermission(id, orgId);
      default:
        throw new UnauthorizedError({
          message: "Permission not defined",
          name: "Get org permission"
        });
    }
  };

  return {
    getUserOrgPermission,
    getOrgPermission,
    getUserProjectPermission,
    getProjectPermission
  };
};
