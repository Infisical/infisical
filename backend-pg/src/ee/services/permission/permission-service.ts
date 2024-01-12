import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";

import { OrgMembershipRole, ProjectMembershipRole, ServiceTokenScopes } from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgRoleDalFactory } from "@app/services/org/org-role-dal";
import { TProjectRoleDalFactory } from "@app/services/project-role/project-role-dal";
import { TServiceTokenDalFactory } from "@app/services/service-token/service-token-dal";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet
} from "./org-permission";
import { TPermissionDalFactory } from "./permission-dal";
import {
  buildServiceTokenProjectPermission,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  ProjectPermissionSet
} from "./project-permission";

type TPermissionServiceFactoryDep = {
  orgRoleDal: Pick<TOrgRoleDalFactory, "findOne">;
  projectRoleDal: Pick<TProjectRoleDalFactory, "findOne">;
  serviceTokenDal: Pick<TServiceTokenDalFactory, "findById">;
  permissionDal: TPermissionDalFactory;
};

export type TPermissionServiceFactory = ReturnType<typeof permissionServiceFactory>;

export const permissionServiceFactory = ({
  permissionDal,
  orgRoleDal,
  projectRoleDal,
  serviceTokenDal
}: TPermissionServiceFactoryDep) => {
  const buildOrgPermission = (role: string, permission?: unknown) => {
    switch (role) {
      case OrgMembershipRole.Admin:
        return orgAdminPermissions;
      case OrgMembershipRole.Member:
        return orgMemberPermissions;
      case OrgMembershipRole.NoAccess:
        return orgNoAccessPermissions;
      case OrgMembershipRole.Custom:
        return createMongoAbility<OrgPermissionSet>(
          unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(
            permission as PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[]
          ),
          {
            conditionsMatcher
          }
        );
      default:
        throw new BadRequestError({ name: "OrgRoleInvalid", message: "Org role not found" });
    }
  };

  const buildProjectPermission = (role: string, permission?: unknown) => {
    switch (role) {
      case ProjectMembershipRole.Admin:
        return projectAdminPermissions;
      case ProjectMembershipRole.Member:
        return projectMemberPermissions;
      case ProjectMembershipRole.NoAccess:
        return projectNoAccessPermissions;
      case ProjectMembershipRole.Custom:
        return createMongoAbility<ProjectPermissionSet>(
          unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(
            permission as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[]
          ),
          {
            conditionsMatcher
          }
        );
      default:
        throw new BadRequestError({
          name: "ProjectRoleInvalid",
          message: "Project role not found"
        });
    }
  };

  /*
   * Get user permission in an organization
   * */
  const getUserOrgPermission = async (userId: string, orgId: string) => {
    const membership = await permissionDal.getOrgPermission(userId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }
    return { permission: buildOrgPermission(membership.role, membership.permissions), membership };
  };

  const getIdentityOrgPermission = async (identityId: string, orgId: string) => {
    const membership = await permissionDal.getOrgIdentityPermission(identityId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "Identity not in org" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }
    return { permission: buildOrgPermission(membership.role, membership.permissions), membership };
  };

  const getOrgPermission = async (type: ActorType, id: string, orgId: string) => {
    switch (type) {
      case ActorType.USER:
        return getUserOrgPermission(id, orgId);
      case ActorType.IDENTITY:
        return getIdentityOrgPermission(id, orgId);
      default:
        throw new UnauthorizedError({
          message: "Permission not defined",
          name: "Get org permission"
        });
    }
  };

  // instead of actor type this will fetch by role slug. meaning it can be the pre defined slugs like
  // admin member or user defined ones like biller etc
  const getOrgPermissionByRole = async (role: string, orgId: string) => {
    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (isCustomRole) {
      const orgRole = await orgRoleDal.findOne({ slug: role, orgId });
      if (!orgRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: buildOrgPermission(OrgMembershipRole.Custom, orgRole.permissions),
        role: orgRole
      };
    }
    return { permission: buildOrgPermission(role, []) };
  };

  // user permission for a project in an organization
  const getUserProjectPermission = async (userId: string, projectId: string) => {
    const membership = await permissionDal.getProjectPermission(userId, projectId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === ProjectMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }
    return {
      permission: buildProjectPermission(membership.role, membership.permissions),
      membership
    };
  };

  const getIdentityProjectPermission = async (identityId: string, projectId: string) => {
    const membership = await permissionDal.getProjectIdentityPermission(identityId, projectId);
    if (!membership) throw new UnauthorizedError({ name: "Identity not in org" });
    if (membership.role === ProjectMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }
    return {
      permission: buildProjectPermission(membership.role, membership.permissions),
      membership
    };
  };

  const getServiceTokenProjectPermission = async (serviceTokenId: string, projectId: string) => {
    const serviceToken = await serviceTokenDal.findById(serviceTokenId);
    if (serviceToken.projectId !== projectId)
      throw new UnauthorizedError({
        message: "Failed to find service authorization for given project"
      });
    const scopes = ServiceTokenScopes.parse(serviceToken.scopes || []);
    return {
      permission: buildServiceTokenProjectPermission(scopes, serviceToken.permissions),
      member: undefined
    };
  };

  const getProjectPermission = async (type: ActorType, id: string, projectId: string) => {
    switch (type) {
      case ActorType.USER:
        return getUserProjectPermission(id, projectId);
      case ActorType.SERVICE:
        return getServiceTokenProjectPermission(id, projectId);
      case ActorType.IDENTITY:
        return getIdentityProjectPermission(id, projectId);
      default:
        throw new UnauthorizedError({
          message: "Permission not defined",
          name: "Get org permission"
        });
    }
  };

  const getProjectPermissionByRole = async (role: string, projectId: string) => {
    const isCustomRole = !Object.values(ProjectMembershipRole).includes(
      role as ProjectMembershipRole
    );
    if (isCustomRole) {
      const projectRole = await projectRoleDal.findOne({ slug: role, projectId });
      if (!projectRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: buildProjectPermission(ProjectMembershipRole.Custom, projectRole.permissions),
        role: projectRole
      };
    }
    return { permission: buildProjectPermission(role, []) };
  };

  return {
    getUserOrgPermission,
    getOrgPermission,
    getUserProjectPermission,
    getProjectPermission,
    getOrgPermissionByRole,
    getProjectPermissionByRole,
    buildOrgPermission,
    buildProjectPermission
  };
};
