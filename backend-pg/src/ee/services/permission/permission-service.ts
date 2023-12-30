import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgRoleDalFactory } from "@app/services/org/org-role-dal";
import { TProjectRoleDalFactory } from "@app/services/project-role/project-role-dal";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet
} from "./org-permission";
import { TPermissionDalFactory } from "./permission-dal";
import {
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  ProjectPermissionSet,
  projectViewerPermission
} from "./project-permission";

type TPermissionServiceFactoryDep = {
  orgRoleDal: Pick<TOrgRoleDalFactory, "findOne">;
  projectRoleDal: Pick<TProjectRoleDalFactory, "findOne">;
  permissionDal: TPermissionDalFactory;
};

export type TPermissionServiceFactory = ReturnType<typeof permissionServiceFactory>;

export const permissionServiceFactory = ({
  permissionDal,
  orgRoleDal,
  projectRoleDal
}: TPermissionServiceFactoryDep) => {
  /*
   * Get user permission in an organization
   * */
  const getUserOrgPermission = async (userId: string, orgId: string) => {
    const membership = await permissionDal.getOrgPermission(userId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === "custom" && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    if (membership.role === OrgMembershipRole.Admin)
      return { permission: orgAdminPermissions, membership };
    if (membership.role === OrgMembershipRole.Member)
      return { permission: orgMemberPermissions, membership };

    if (membership.role === OrgMembershipRole.NoAccess)
      return { permission: orgNoAccessPermissions, membership };
    if (membership.role === OrgMembershipRole.Custom) {
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
    if (membership.role === ProjectMembershipRole.Custom && !membership.permissions) {
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
      const permission = createMongoAbility<ProjectPermissionSet>(
        // akhilmhdh: putting any due to ts incompatiable matching with string and the other
        unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(membership.permissions as any),
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

  const getOrgPermissionByRole = async (role: string, orgId: string) => {
    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (isCustomRole) {
      const orgRole = await orgRoleDal.findOne({ slug: role, orgId });
      if (!orgRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: createMongoAbility<OrgPermissionSet>(
          unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(
            (orgRole.permissions as PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[]) || []
          ),
          {
            conditionsMatcher
          }
        ),
        role: orgRole
      };
    }
    switch (role) {
      case OrgMembershipRole.Admin:
        return { permission: orgAdminPermissions };
      case OrgMembershipRole.Member:
        return { permission: orgMemberPermissions };
      case OrgMembershipRole.NoAccess:
        return { permission: orgNoAccessPermissions };
      default:
        throw new BadRequestError({ message: "Org role not found" });
    }
  };

  const getProjectPermissionByRole = async (role: string, projectId: string) => {
    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (isCustomRole) {
      const projectRole = await projectRoleDal.findOne({ slug: role, projectId });
      if (!projectRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: createMongoAbility<ProjectPermissionSet>(
          unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(
            (projectRole.permissions as PackRule<
              RawRuleOf<MongoAbility<ProjectPermissionSet>>
            >[]) || []
          ),
          {
            conditionsMatcher
          }
        ),
        role: projectRole
      };
    }
    switch (role) {
      case ProjectMembershipRole.Admin:
        return { permission: projectAdminPermissions };
      case ProjectMembershipRole.Member:
        return { permission: projectMemberPermissions };
      case ProjectMembershipRole.NoAccess:
        return { permission: projectNoAccessPermissions };
      default:
        throw new BadRequestError({ message: "Org role not found" });
    }
  };

  return {
    getUserOrgPermission,
    getOrgPermission,
    getUserProjectPermission,
    getProjectPermission,
    getOrgPermissionByRole,
    getProjectPermissionByRole
  };
};
