import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";
import { MongoQuery } from "@ucast/mongo2js";
import handlebars from "handlebars";

import {
  ActionProjectType,
  OrgMembershipRole,
  ProjectMembershipRole,
  ServiceTokenScopes,
  TIdentityProjectMemberships,
  TProjectMemberships
} from "@app/db/schemas";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { objectify } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TOrgRoleDALFactory } from "@app/services/org/org-role-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectRoleDALFactory } from "@app/services/project-role/project-role-dal";
import { TServiceTokenDALFactory } from "@app/services/service-token/service-token-dal";

import { orgAdminPermissions, orgMemberPermissions, orgNoAccessPermissions, OrgPermissionSet } from "./org-permission";
import { TPermissionDALFactory } from "./permission-dal";
import { escapeHandlebarsMissingDict, validateOrgSSO } from "./permission-fns";
import {
  TBuildOrgPermissionDTO,
  TBuildProjectPermissionDTO,
  TGetIdentityProjectPermissionArg,
  TGetProjectPermissionArg,
  TGetServiceTokenProjectPermissionArg,
  TGetUserProjectPermissionArg,
  TPermissionServiceFactory
} from "./permission-service-types";
import { buildServiceTokenProjectPermission, ProjectPermissionSet } from "./project-permission";

type TPermissionServiceFactoryDep = {
  orgRoleDAL: Pick<TOrgRoleDALFactory, "findOne">;
  projectRoleDAL: Pick<TProjectRoleDALFactory, "findOne">;
  serviceTokenDAL: Pick<TServiceTokenDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionDAL: TPermissionDALFactory;
};

export const permissionServiceFactory = ({
  permissionDAL,
  orgRoleDAL,
  projectRoleDAL,
  serviceTokenDAL,
  projectDAL
}: TPermissionServiceFactoryDep): TPermissionServiceFactory => {
  const buildOrgPermission = (orgUserRoles: TBuildOrgPermissionDTO) => {
    const rules = orgUserRoles
      .map(({ role, permissions }) => {
        switch (role) {
          case OrgMembershipRole.Admin:
            return orgAdminPermissions;
          case OrgMembershipRole.Member:
            return orgMemberPermissions;
          case OrgMembershipRole.NoAccess:
            return orgNoAccessPermissions;
          case OrgMembershipRole.Custom:
            return unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(
              permissions as PackRule<RawRuleOf<MongoAbility<OrgPermissionSet>>>[]
            );
          default:
            throw new NotFoundError({ name: "OrgRoleInvalid", message: `Organization role '${role}' not found` });
        }
      })
      .reduce((prev, curr) => prev.concat(curr), []);

    return createMongoAbility<OrgPermissionSet>(rules, {
      conditionsMatcher
    });
  };

  const buildProjectPermissionRules = (projectUserRoles: TBuildProjectPermissionDTO) => {
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
          case ProjectMembershipRole.SshHostBootstrapper:
            return sshHostBootstrapPermissions;
          case ProjectMembershipRole.KmsCryptographicOperator:
            return cryptographicOperatorPermissions;
          case ProjectMembershipRole.Custom: {
            return unpackRules<RawRuleOf<MongoAbility<ProjectPermissionSet>>>(
              permissions as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[]
            );
          }
          default:
            throw new NotFoundError({
              name: "ProjectRoleInvalid",
              message: `Project role '${role}' not found`
            });
        }
      })
      .reduce((prev, curr) => prev.concat(curr), []);

    return rules;
  };

  /*
   * Get user permission in an organization
   */
  const getUserOrgPermission: TPermissionServiceFactory["getUserOrgPermission"] = async (
    userId,
    orgId,
    authMethod,
    userOrgId
  ) => {
    // when token is scoped, ensure the passed org id is same as user org id
    if (userOrgId && userOrgId !== orgId)
      throw new ForbiddenRequestError({ message: "Invalid user token. Scoped to different organization." });
    const membership = await permissionDAL.getOrgPermission(userId, orgId);
    if (!membership) throw new ForbiddenRequestError({ name: "You are not apart of this organization" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new BadRequestError({ name: "Custom organization permission not found" });
    }

    // If the org ID is API_KEY, the request is being made with an API Key.
    // Since we can't scope API keys to an organization, we'll need to do an arbitrary check to see if the user is a member of the organization.

    // Extra: This means that when users are using API keys to make requests, they can't use slug-based routes.
    // Slug-based routes depend on the organization ID being present on the request, since project slugs aren't globally unique, and we need a way to filter by organization.
    if (userOrgId !== "API_KEY" && membership.orgId !== userOrgId) {
      throw new ForbiddenRequestError({ name: "You are not logged into this organization" });
    }

    validateOrgSSO(
      authMethod,
      membership.orgAuthEnforced,
      membership.bypassOrgAuthEnabled,
      membership.role as OrgMembershipRole
    );

    const finalPolicyRoles = [{ role: membership.role, permissions: membership.permissions }].concat(
      membership?.groups?.map(({ role, customRolePermission }) => ({
        role,
        permissions: customRolePermission
      })) || []
    );
    return { permission: buildOrgPermission(finalPolicyRoles), membership };
  };

  const getIdentityOrgPermission = async (identityId: string, orgId: string) => {
    const membership = await permissionDAL.getOrgIdentityPermission(identityId, orgId);
    if (!membership) throw new ForbiddenRequestError({ name: "Identity is not apart of this organization" });
    if (membership.role === OrgMembershipRole.Custom && !membership.permissions) {
      throw new NotFoundError({ name: `Custom organization permission not found for identity ${identityId}` });
    }
    return {
      permission: buildOrgPermission([{ role: membership.role, permissions: membership.permissions }]),
      membership
    };
  };

  const getOrgPermission: TPermissionServiceFactory["getOrgPermission"] = async (
    type,
    id,
    orgId,
    authMethod,
    actorOrgId
  ) => {
    switch (type) {
      case ActorType.USER:
        return getUserOrgPermission(id, orgId, authMethod, actorOrgId);
      case ActorType.IDENTITY:
        return getIdentityOrgPermission(id, orgId);
      default:
        throw new BadRequestError({
          message: "Invalid actor provided",
          name: "Get org permission"
        });
    }
  };

  // instead of actor type this will fetch by role slug. meaning it can be the pre defined slugs like
  // admin member or user defined ones like biller etc
  const getOrgPermissionByRole: TPermissionServiceFactory["getOrgPermissionByRole"] = async (role, orgId) => {
    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    if (isCustomRole) {
      const orgRole = await orgRoleDAL.findOne({ slug: role, orgId });
      if (!orgRole)
        throw new NotFoundError({
          message: `Specified role '${role}' was not found in the organization with ID '${orgId}'`
        });
      return {
        permission: buildOrgPermission([{ role: OrgMembershipRole.Custom, permissions: orgRole.permissions }]),
        role: orgRole
      };
    }
    return { permission: buildOrgPermission([{ role, permissions: [] }]) };
  };

  // user permission for a project in an organization
  const getUserProjectPermission = async ({
    userId,
    projectId,
    authMethod,
    userOrgId,
    actionProjectType
  }: TGetUserProjectPermissionArg): Promise<TProjectPermissionRT<ActorType.USER>> => {
    const userProjectPermission = await permissionDAL.getProjectPermission(userId, projectId);
    if (!userProjectPermission) throw new ForbiddenRequestError({ name: "User not a part of the specified project" });

    if (
      userProjectPermission.roles.some(({ role, permissions }) => role === ProjectMembershipRole.Custom && !permissions)
    ) {
      throw new NotFoundError({ name: "The permission was not found" });
    }

    // If the org ID is API_KEY, the request is being made with an API Key.
    // Since we can't scope API keys to an organization, we'll need to do an arbitrary check to see if the user is a member of the organization.

    // Extra: This means that when users are using API keys to make requests, they can't use slug-based routes.
    // Slug-based routes depend on the organization ID being present on the request, since project slugs aren't globally unique, and we need a way to filter by organization.
    if (userOrgId !== "API_KEY" && userProjectPermission.orgId !== userOrgId) {
      throw new ForbiddenRequestError({ name: "You are not logged into this organization" });
    }

    validateOrgSSO(
      authMethod,
      userProjectPermission.orgAuthEnforced,
      userProjectPermission.bypassOrgAuthEnabled,
      userProjectPermission.orgRole
    );

    if (actionProjectType !== ActionProjectType.Any && actionProjectType !== userProjectPermission.projectType) {
      throw new BadRequestError({
        message: `The project is of type ${userProjectPermission.projectType}. Operations of type ${actionProjectType} are not allowed.`
      });
    }

    // join two permissions and pass to build the final permission set
    const rolePermissions = userProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
    const additionalPrivileges =
      userProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
        role: ProjectMembershipRole.Custom,
        permissions
      })) || [];

    const rules = buildProjectPermissionRules(rolePermissions.concat(additionalPrivileges));
    const templatedRules = handlebars.compile(JSON.stringify(rules), { data: false });
    const unescapedMetadata = objectify(
      userProjectPermission.metadata,
      (i) => i.key,
      (i) => i.value
    );
    const metadataKeyValuePair = escapeHandlebarsMissingDict(unescapedMetadata, "identity.metadata");
    requestContext.set("identityPermissionMetadata", { metadata: unescapedMetadata });
    const interpolateRules = templatedRules(
      {
        identity: {
          id: userProjectPermission.userId,
          username: userProjectPermission.username,
          metadata: metadataKeyValuePair
        }
      },
      { data: false }
    );
    const permission = createMongoAbility<ProjectPermissionSet>(
      JSON.parse(interpolateRules) as RawRuleOf<MongoAbility<ProjectPermissionSet>>[],
      {
        conditionsMatcher
      }
    );

    return {
      permission,
      membership: userProjectPermission,
      hasRole: (role: string) =>
        userProjectPermission.roles.findIndex(
          ({ role: slug, customRoleSlug }) => role === slug || slug === customRoleSlug
        ) !== -1
    };
  };

  const getIdentityProjectPermission = async ({
    identityId,
    projectId,
    identityOrgId,
    actionProjectType
  }: TGetIdentityProjectPermissionArg): Promise<TProjectPermissionRT<ActorType.IDENTITY>> => {
    const identityProjectPermission = await permissionDAL.getProjectIdentityPermission(identityId, projectId);
    if (!identityProjectPermission)
      throw new ForbiddenRequestError({
        name: `Identity is not a member of the specified project with ID '${projectId}'`
      });

    if (
      identityProjectPermission.roles.some(
        ({ role, permissions }) => role === ProjectMembershipRole.Custom && !permissions
      )
    ) {
      throw new NotFoundError({ name: "Custom permission not found" });
    }

    if (identityProjectPermission.orgId !== identityOrgId) {
      throw new ForbiddenRequestError({ name: "Identity is not a member of the specified organization" });
    }

    if (actionProjectType !== ActionProjectType.Any && actionProjectType !== identityProjectPermission.projectType) {
      throw new BadRequestError({
        message: `The project is of type ${identityProjectPermission.projectType}. Operations of type ${actionProjectType} are not allowed.`
      });
    }

    const rolePermissions =
      identityProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
    const additionalPrivileges =
      identityProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
        role: ProjectMembershipRole.Custom,
        permissions
      })) || [];

    const rules = buildProjectPermissionRules(rolePermissions.concat(additionalPrivileges));
    const templatedRules = handlebars.compile(JSON.stringify(rules), { data: false });
    const unescapedIdentityAuthInfo = requestContext.get("identityAuthInfo");
    const unescapedMetadata = objectify(
      identityProjectPermission.metadata,
      (i) => i.key,
      (i) => i.value
    );
    const identityAuthInfo =
      unescapedIdentityAuthInfo?.identityId === identityId && unescapedIdentityAuthInfo
        ? escapeHandlebarsMissingDict(unescapedIdentityAuthInfo as never, "identity.auth")
        : {};
    const metadataKeyValuePair = escapeHandlebarsMissingDict(unescapedMetadata, "identity.metadata");

    requestContext.set("identityPermissionMetadata", { metadata: unescapedMetadata, auth: unescapedIdentityAuthInfo });
    const interpolateRules = templatedRules(
      {
        identity: {
          id: identityProjectPermission.identityId,
          username: identityProjectPermission.username,
          metadata: metadataKeyValuePair,
          auth: identityAuthInfo
        }
      },
      { data: false }
    );
    const permission = createMongoAbility<ProjectPermissionSet>(
      JSON.parse(interpolateRules) as RawRuleOf<MongoAbility<ProjectPermissionSet>>[],
      {
        conditionsMatcher
      }
    );

    return {
      permission,
      membership: identityProjectPermission,
      hasRole: (role: string) =>
        identityProjectPermission.roles.findIndex(
          ({ role: slug, customRoleSlug }) => role === slug || slug === customRoleSlug
        ) !== -1
    };
  };

  const getServiceTokenProjectPermission = async ({
    serviceTokenId,
    projectId,
    actorOrgId,
    actionProjectType
  }: TGetServiceTokenProjectPermissionArg) => {
    const serviceToken = await serviceTokenDAL.findById(serviceTokenId);
    if (!serviceToken) throw new NotFoundError({ message: `Service token with ID '${serviceTokenId}' not found` });

    const serviceTokenProject = await projectDAL.findById(serviceToken.projectId);

    if (!serviceTokenProject) throw new BadRequestError({ message: "Service token not linked to a project" });

    if (serviceTokenProject.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Service token not a part of the specified organization" });
    }

    if (serviceToken.projectId !== projectId) {
      throw new ForbiddenRequestError({
        name: `Service token not a part of the specified project with ID ${projectId}`
      });
    }

    if (serviceTokenProject.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({
        message: `Service token not a part of the specified organization with ID ${actorOrgId}`
      });
    }

    if (actionProjectType !== ActionProjectType.Any && actionProjectType !== serviceTokenProject.type) {
      throw new BadRequestError({
        message: `The project is of type ${serviceTokenProject.type}. Operations of type ${actionProjectType} are not allowed.`
      });
    }

    const scopes = ServiceTokenScopes.parse(serviceToken.scopes || []);
    return {
      permission: buildServiceTokenProjectPermission(scopes, serviceToken.permissions),
      membership: {
        shouldUseNewPrivilegeSystem: true
      }
    };
  };

  type TProjectPermissionRT<T extends ActorType> = T extends ActorType.SERVICE
    ? {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        membership: {
          shouldUseNewPrivilegeSystem: boolean;
        };
        hasRole: (arg: string) => boolean;
      } // service token doesn't have both membership and roles
    : {
        permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
        membership: (T extends ActorType.USER ? TProjectMemberships : TIdentityProjectMemberships) & {
          orgAuthEnforced: boolean | null | undefined;
          orgId: string;
          roles: Array<{ role: string }>;
          shouldUseNewPrivilegeSystem: boolean;
        };
        hasRole: (role: string) => boolean;
      };

  const getProjectPermissions: TPermissionServiceFactory["getProjectPermissions"] = async (projectId) => {
    // fetch user permissions
    const rawUserProjectPermissions = await permissionDAL.getProjectUserPermissions(projectId);
    const userPermissions = rawUserProjectPermissions.map((userProjectPermission) => {
      const rolePermissions =
        userProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
      const additionalPrivileges =
        userProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
          role: ProjectMembershipRole.Custom,
          permissions
        })) || [];

      const rules = buildProjectPermissionRules(rolePermissions.concat(additionalPrivileges));
      const templatedRules = handlebars.compile(JSON.stringify(rules), { data: false });
      const metadataKeyValuePair = escapeHandlebarsMissingDict(
        objectify(
          userProjectPermission.metadata,
          (i) => i.key,
          (i) => i.value
        ),
        "identity.metadata"
      );
      const interpolateRules = templatedRules(
        {
          identity: {
            id: userProjectPermission.userId,
            username: userProjectPermission.username,
            metadata: metadataKeyValuePair
          }
        },
        { data: false }
      );
      const permission = createMongoAbility<ProjectPermissionSet>(
        JSON.parse(interpolateRules) as RawRuleOf<MongoAbility<ProjectPermissionSet>>[],
        {
          conditionsMatcher
        }
      );

      return {
        permission,
        id: userProjectPermission.userId,
        name: userProjectPermission.username,
        membershipId: userProjectPermission.id
      };
    });

    // fetch identity permissions
    const rawIdentityProjectPermissions = await permissionDAL.getProjectIdentityPermissions(projectId);
    const identityPermissions = rawIdentityProjectPermissions.map((identityProjectPermission) => {
      const rolePermissions =
        identityProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
      const additionalPrivileges =
        identityProjectPermission.additionalPrivileges?.map(({ permissions }) => ({
          role: ProjectMembershipRole.Custom,
          permissions
        })) || [];

      const rules = buildProjectPermissionRules(rolePermissions.concat(additionalPrivileges));
      const templatedRules = handlebars.compile(JSON.stringify(rules), { data: false });
      const metadataKeyValuePair = escapeHandlebarsMissingDict(
        objectify(
          identityProjectPermission.metadata,
          (i) => i.key,
          (i) => i.value
        ),
        "identity.metadata"
      );
      const interpolateRules = templatedRules(
        {
          identity: {
            id: identityProjectPermission.identityId,
            username: identityProjectPermission.username,
            metadata: metadataKeyValuePair
          }
        },
        { data: false }
      );
      const permission = createMongoAbility<ProjectPermissionSet>(
        JSON.parse(interpolateRules) as RawRuleOf<MongoAbility<ProjectPermissionSet>>[],
        {
          conditionsMatcher
        }
      );

      return {
        permission,
        id: identityProjectPermission.identityId,
        name: identityProjectPermission.username,
        membershipId: identityProjectPermission.id
      };
    });

    // fetch group permissions
    const rawGroupProjectPermissions = await permissionDAL.getProjectGroupPermissions(projectId);
    const groupPermissions = rawGroupProjectPermissions.map((groupProjectPermission) => {
      const rolePermissions =
        groupProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
      const rules = buildProjectPermissionRules(rolePermissions);
      const permission = createMongoAbility<ProjectPermissionSet>(rules, {
        conditionsMatcher
      });

      return {
        permission,
        id: groupProjectPermission.groupId,
        name: groupProjectPermission.username,
        membershipId: groupProjectPermission.id
      };
    });

    return {
      userPermissions,
      identityPermissions,
      groupPermissions
    };
  };

  const getProjectPermission = async <T extends ActorType>({
    actor: inputActor,
    actorId: inputActorId,
    projectId,
    actorAuthMethod,
    actorOrgId,
    actionProjectType
  }: TGetProjectPermissionArg): Promise<TProjectPermissionRT<T>> => {
    let actor = inputActor;
    let actorId = inputActorId;
    const assumedPrivilegeDetailsCtx = requestContext.get("assumedPrivilegeDetails");
    if (
      assumedPrivilegeDetailsCtx &&
      actor === ActorType.USER &&
      actorId === assumedPrivilegeDetailsCtx.requesterId &&
      projectId === assumedPrivilegeDetailsCtx.projectId
    ) {
      actor = assumedPrivilegeDetailsCtx.actorType;
      actorId = assumedPrivilegeDetailsCtx.actorId;
    }

    switch (actor) {
      case ActorType.USER:
        return getUserProjectPermission({
          userId: actorId,
          projectId,
          authMethod: actorAuthMethod,
          userOrgId: actorOrgId,
          actionProjectType
        }) as Promise<TProjectPermissionRT<T>>;
      case ActorType.SERVICE:
        return getServiceTokenProjectPermission({
          serviceTokenId: actorId,
          projectId,
          actorOrgId,
          actionProjectType
        }) as Promise<TProjectPermissionRT<T>>;
      case ActorType.IDENTITY:
        return getIdentityProjectPermission({
          identityId: actorId,
          projectId,
          identityOrgId: actorOrgId,
          actionProjectType
        }) as Promise<TProjectPermissionRT<T>>;
      default:
        throw new BadRequestError({
          message: "Invalid actor provided",
          name: "Get project permission"
        });
    }
  };

  const getProjectPermissionByRole: TPermissionServiceFactory["getProjectPermissionByRole"] = async (
    role,
    projectId
  ) => {
    const isCustomRole = !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole);
    if (isCustomRole) {
      const projectRole = await projectRoleDAL.findOne({ slug: role, projectId });
      if (!projectRole) throw new NotFoundError({ message: `Specified role was not found: ${role}` });
      const rules = buildProjectPermissionRules([
        { role: ProjectMembershipRole.Custom, permissions: projectRole.permissions }
      ]);
      return {
        permission: createMongoAbility<ProjectPermissionSet>(rules, {
          conditionsMatcher
        }),
        role: projectRole
      };
    }

    const rules = buildProjectPermissionRules([{ role, permissions: [] }]);
    const permission = createMongoAbility<ProjectPermissionSet>(rules, {
      conditionsMatcher
    });
    return { permission };
  };

  const checkGroupProjectPermission: TPermissionServiceFactory["checkGroupProjectPermission"] = async ({
    groupId,
    projectId,
    checkPermissions
  }) => {
    const rawGroupProjectPermissions = await permissionDAL.getProjectGroupPermissions(projectId, groupId);
    const groupPermissions = rawGroupProjectPermissions.map((groupProjectPermission) => {
      const rolePermissions =
        groupProjectPermission.roles?.map(({ role, permissions }) => ({ role, permissions })) || [];
      const rules = buildProjectPermissionRules(rolePermissions);
      const permission = createMongoAbility<ProjectPermissionSet>(rules, {
        conditionsMatcher
      });

      return {
        permission,
        id: groupProjectPermission.groupId,
        name: groupProjectPermission.username,
        membershipId: groupProjectPermission.id
      };
    });
    return groupPermissions.some((groupPermission) => groupPermission.permission.can(...checkPermissions));
  };

  return {
    getUserOrgPermission,
    getOrgPermission,
    getUserProjectPermission,
    getProjectPermission,
    getProjectPermissions,
    getOrgPermissionByRole,
    getProjectPermissionByRole,
    buildOrgPermission,
    buildProjectPermissionRules,
    checkGroupProjectPermission
  };
};
