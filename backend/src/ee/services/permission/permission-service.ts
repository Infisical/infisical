import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { MongoQuery } from "@ucast/mongo2js";

import {
  OrgMembershipRole,
  ProjectMembershipRole,
  ServiceTokenScopes,
  TIdentityProjectMemberships,
  TProjectMemberships
} from "@app/db/schemas";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TOrgRoleDALFactory } from "@app/services/org/org-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectRoleDALFactory } from "@app/services/project-role/project-role-dal";
import { TServiceTokenDALFactory } from "@app/services/service-token/service-token-dal";

import { orgAdminPermissions, orgMemberPermissions, orgNoAccessPermissions, OrgPermissionSet } from "./org-permission";
import { TPermissionDALFactory } from "./permission-dal";
import { validateOrgSAML } from "./permission-fns";
import { TBuildProjectPermissionDTO } from "./permission-types";
import {
  buildServiceTokenProjectPermission,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  ProjectPermissionSet,
  projectViewerPermission
} from "./project-permission";

type TPermissionServiceFactoryDep = {
  orgRoleDAL: Pick<TOrgRoleDALFactory, "findOne">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "findOne">;
  serviceTokenDAL: Pick<TServiceTokenDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionDAL: TPermissionDALFactory;
};

export type TPermissionServiceFactory = ReturnType<typeof permissionServiceFactory>;

export const permissionServiceFactory = ({
  permissionDAL,
  orgRoleDAL,
  projectRoleDAL,
  serviceTokenDAL,
  projectDAL
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

  const buildProjectPermission = (projectUserRoles: TBuildProjectPermissionDTO) => {
    const rules = projectUserRoles
      .map(({ role, permissions }) => {
        switch (role) {
          case ProjectMembershipRole.Admin:
            return projectAdminPermissions;
          case ProjectMembershipRole.Member:
            return projectMemberPermissions;
          case ProjectMembershipRole.Viewer:
            return projectViewerPermission;
          case ProjectMembershipRole.NoAccess:
            return projectNoAccessPermissions;
          case ProjectMembershipRole.Custom: {
            return unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(
              permissions as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[]
            );
          }
          default:
            throw new BadRequestError({
              name: "ProjectRoleInvalid",
              message: "Project role not found"
            });
        }
      })
      .reduce((curr, prev) => prev.concat(curr), []);

    return createMongoAbility<ProjectPermissionSet>(rules, {
      conditionsMatcher
    });
  };

  /*
   * Get user permission in an organization
   */
  const getUserOrgPermission = async (
    userId: string,
    orgId: string,
    authMethod: ActorAuthMethod,
    userOrgId?: string
  ) => {
    // when token is scoped, ensure the passed org id is same as user org id
    if (userOrgId && userOrgId !== orgId)
      throw new BadRequestError({ message: "Invalid user token. Scoped to different organization." });
    const membership = await permissionDAL.getOrgPermission(userId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "User not in org" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    // If the org ID is API_KEY, the request is being made with an API Key.
    // Since we can't scope API keys to an organization, we'll need to do an arbitrary check to see if the user is a member of the organization.

    // Extra: This means that when users are using API keys to make requests, they can't use slug-based routes.
    // Slug-based routes depend on the organization ID being present on the request, since project slugs aren't globally unique, and we need a way to filter by organization.
    if (userOrgId !== "API_KEY" && membership.orgId !== userOrgId) {
      throw new UnauthorizedError({ name: "You are not logged into this organization" });
    }

    validateOrgSAML(authMethod, membership.orgAuthEnforced);

    return { permission: buildOrgPermission(membership.role, membership.permissions), membership };
  };

  const getIdentityOrgPermission = async (identityId: string, orgId: string) => {
    const membership = await permissionDAL.getOrgIdentityPermission(identityId, orgId);
    if (!membership) throw new UnauthorizedError({ name: "Identity not in org" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }
    return { permission: buildOrgPermission(membership.role, membership.permissions), membership };
  };

  const getOrgPermission = async (
    type: ActorType,
    id: string,
    orgId: string,
    authMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ) => {
    switch (type) {
      case ActorType.USER:
        return getUserOrgPermission(id, orgId, authMethod, actorOrgId);
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
      const orgRole = await orgRoleDAL.findOne({ slug: role, orgId });
      if (!orgRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: buildOrgPermission(OrgMembershipRole.Custom, orgRole.permissions),
        role: orgRole
      };
    }
    return { permission: buildOrgPermission(role, []) };
  };

  // user permission for a project in an organization
  const getUserProjectPermission = async (
    userId: string,
    projectId: string,
    authMethod: ActorAuthMethod,
    userOrgId?: string
  ): Promise<TProjectPermissionRT<ActorType.USER>> => {
    const userProjectPermission = await permissionDAL.getProjectPermission(userId, projectId);
    if (!userProjectPermission) throw new UnauthorizedError({ name: "User not in project" });

    if (
      userProjectPermission.roles.some(({ role, permissions }) => role === ProjectMembershipRole.Custom && !permissions)
    ) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    // If the org ID is API_KEY, the request is being made with an API Key.
    // Since we can't scope API keys to an organization, we'll need to do an arbitrary check to see if the user is a member of the organization.

    // Extra: This means that when users are using API keys to make requests, they can't use slug-based routes.
    // Slug-based routes depend on the organization ID being present on the request, since project slugs aren't globally unique, and we need a way to filter by organization.
    if (userOrgId !== "API_KEY" && userProjectPermission.orgId !== userOrgId) {
      throw new UnauthorizedError({ name: "You are not logged into this organization" });
    }

    validateOrgSAML(authMethod, userProjectPermission.orgAuthEnforced);

    // join two permissions and pass to build the final permission set
    const rolePermissions = userProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
    const additionalPrivileges =
      userProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
        role: ProjectMembershipRole.Custom,
        permissions
      })) || [];

    return {
      permission: buildProjectPermission(rolePermissions.concat(additionalPrivileges)),
      membership: userProjectPermission,
      hasRole: (role: string) =>
        userProjectPermission.roles.findIndex(
          ({ role: slug, customRoleSlug }) => role === slug || slug === customRoleSlug
        ) !== -1
    };
  };

  const getIdentityProjectPermission = async (
    identityId: string,
    projectId: string,
    identityOrgId: string | undefined
  ): Promise<TProjectPermissionRT<ActorType.IDENTITY>> => {
    const identityProjectPermission = await permissionDAL.getProjectIdentityPermission(identityId, projectId);
    if (!identityProjectPermission) throw new UnauthorizedError({ name: "Identity not in project" });

    if (
      identityProjectPermission.roles.some(
        ({ role, permissions }) => role === ProjectMembershipRole.Custom && !permissions
      )
    ) {
      throw new BadRequestError({ name: "Custom permission not found" });
    }

    if (identityProjectPermission.orgId !== identityOrgId) {
      throw new UnauthorizedError({ name: "You are not a member of this organization" });
    }

    const rolePermissions =
      identityProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
    const additionalPrivileges =
      identityProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
        role: ProjectMembershipRole.Custom,
        permissions
      })) || [];

    return {
      permission: buildProjectPermission(rolePermissions.concat(additionalPrivileges)),
      membership: identityProjectPermission,
      hasRole: (role: string) =>
        identityProjectPermission.roles.findIndex(
          ({ role: slug, customRoleSlug }) => role === slug || slug === customRoleSlug
        ) !== -1
    };
  };

  const getServiceTokenProjectPermission = async (
    serviceTokenId: string,
    projectId: string,
    actorOrgId: string | undefined
  ) => {
    const serviceToken = await serviceTokenDAL.findById(serviceTokenId);
    if (!serviceToken) throw new BadRequestError({ message: "Service token not found" });

    const serviceTokenProject = await projectDAL.findById(serviceToken.projectId);

    if (!serviceTokenProject) throw new BadRequestError({ message: "Service token not linked to a project" });

    if (serviceTokenProject.orgId !== actorOrgId) {
      throw new UnauthorizedError({ message: "Service token not a part of this organization" });
    }

    if (serviceToken.projectId !== projectId)
      throw new UnauthorizedError({
        message: "Failed to find service authorization for given project"
      });

    if (serviceTokenProject.orgId !== actorOrgId)
      throw new UnauthorizedError({
        message: "Failed to find service authorization for given project"
      });

    const scopes = ServiceTokenScopes.parse(serviceToken.scopes || []);
    return {
      permission: buildServiceTokenProjectPermission(scopes, serviceToken.permissions),
      membership: undefined
    };
  };

  type TProjectPermissionRT<T extends ActorType> = T extends ActorType.SERVICE
    ? {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        membership: undefined;
        hasRole: (arg: string) => boolean;
      } // service token doesn't have both membership and roles
    : {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        membership: (T extends ActorType.USER ? TProjectMemberships : TIdentityProjectMemberships) & {
          orgAuthEnforced: boolean | null | undefined;
          orgId: string;
          roles: Array<{ role: string }>;
        };
        hasRole: (role: string) => boolean;
      };

  const getProjectPermission = async <T extends ActorType>(
    type: T,
    id: string,
    projectId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string | undefined
  ): Promise<TProjectPermissionRT<T>> => {
    switch (type) {
      case ActorType.USER:
        return getUserProjectPermission(id, projectId, actorAuthMethod, actorOrgId) as Promise<TProjectPermissionRT<T>>;
      case ActorType.SERVICE:
        return getServiceTokenProjectPermission(id, projectId, actorOrgId) as Promise<TProjectPermissionRT<T>>;
      case ActorType.IDENTITY:
        return getIdentityProjectPermission(id, projectId, actorOrgId) as Promise<TProjectPermissionRT<T>>;
      default:
        throw new UnauthorizedError({
          message: "Permission not defined",
          name: "Get project permission"
        });
    }
  };

  const getProjectPermissionByRole = async (role: string, projectId: string) => {
    const isCustomRole = !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole);
    if (isCustomRole) {
      const projectRole = await projectRoleDAL.findOne({ slug: role, projectId });
      if (!projectRole) throw new BadRequestError({ message: "Role not found" });
      return {
        permission: buildProjectPermission([
          { role: ProjectMembershipRole.Custom, permissions: projectRole.permissions }
        ]),
        role: projectRole
      };
    }
    return { permission: buildProjectPermission([{ role, permissions: [] }]) };
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
