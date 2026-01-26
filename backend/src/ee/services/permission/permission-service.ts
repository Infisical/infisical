import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { PackRule, unpackRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";
import handlebars from "handlebars";
import { Knex } from "knex";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ServiceTokenScopes,
  TProjects
} from "@app/db/schemas";
import {
  cryptographicOperatorPermissions,
  projectAdminPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { objectify } from "@app/lib/fn";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";
import { TServiceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { orgAdminPermissions, orgMemberPermissions, orgNoAccessPermissions, OrgPermissionSet } from "./org-permission";
import { TPermissionDALFactory } from "./permission-dal";
import { escapeHandlebarsMissingDict, validateOrgSSO } from "./permission-fns";
import {
  TBuildOrgPermissionDTO,
  TBuildProjectPermissionDTO,
  TGetServiceTokenProjectPermissionArg,
  TPermissionServiceFactory
} from "./permission-service-types";
import { buildServiceTokenProjectPermission, ProjectPermissionSet } from "./project-permission";

const buildOrgPermissionRules = (orgUserRoles: TBuildOrgPermissionDTO) => {
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

  return rules;
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

type TPermissionServiceFactoryDep = {
  serviceTokenDAL: Pick<TServiceTokenDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionDAL: TPermissionDALFactory;
  keyStore: TKeyStoreFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  roleDAL: Pick<TRoleDALFactory, "find">;
};

export const permissionServiceFactory = ({
  permissionDAL,
  serviceTokenDAL,
  projectDAL,
  userDAL,
  identityDAL,
  keyStore,
  roleDAL
}: TPermissionServiceFactoryDep): TPermissionServiceFactory => {
  const invalidateProjectPermissionCache = async (projectId: string, tx?: Knex) => {
    const projectPermissionDalVersionKey = KeyStorePrefixes.ProjectPermissionDalVersion(projectId);
    await keyStore.pgIncrementBy(projectPermissionDalVersionKey, {
      incr: 1,
      tx,
      expiry: KeyStoreTtls.ProjectPermissionDalVersionTtl
    });
  };

  // akhilmdhh: will bring this up later
  // const calculateProjectPermissionTtl = (membership: unknown): number => {
  //   const now = new Date();
  //   let minTtl = KeyStoreTtls.ProjectPermissionCacheInSeconds;
  //
  //   const getMinEndTime = (items: Array<{ temporaryAccessEndTime?: Date | null; isTemporary?: boolean }>) => {
  //     return items
  //       .filter((item) => item.isTemporary && item.temporaryAccessEndTime)
  //       .map((item) => item.temporaryAccessEndTime!)
  //       .filter((endTime) => endTime > now)
  //       .reduce((min, endTime) => (!min || endTime < min ? endTime : min), null as Date | null);
  //   };
  //
  //   const roleTimes: Date[] = [];
  //   const additionalPrivilegeTimes: Date[] = [];
  //
  //   if (
  //     membership &&
  //     typeof membership === "object" &&
  //     "roles" in membership &&
  //     Array.isArray((membership as Record<string, unknown>).roles)
  //   ) {
  //     const roles = (membership as Record<string, unknown>).roles as Array<{
  //       temporaryAccessEndTime?: Date | null;
  //       isTemporary?: boolean;
  //     }>;
  //     const minRoleEndTime = getMinEndTime(roles);
  //     if (minRoleEndTime) roleTimes.push(minRoleEndTime);
  //   }
  //
  //   if (
  //     membership &&
  //     typeof membership === "object" &&
  //     "additionalPrivileges" in membership &&
  //     Array.isArray((membership as Record<string, unknown>).additionalPrivileges)
  //   ) {
  //     const additionalPrivileges = (membership as Record<string, unknown>).additionalPrivileges as Array<{
  //       temporaryAccessEndTime?: Date | null;
  //       isTemporary?: boolean;
  //     }>;
  //     const minAdditionalEndTime = getMinEndTime(additionalPrivileges);
  //     if (minAdditionalEndTime) additionalPrivilegeTimes.push(minAdditionalEndTime);
  //   }
  //
  //   const allEndTimes = [...roleTimes, ...additionalPrivilegeTimes];
  //   if (allEndTimes.length > 0) {
  //     const nearestEndTime = allEndTimes.reduce((min, endTime) => (!min || endTime < min ? endTime : min));
  //     const timeUntilExpiry = Math.floor((nearestEndTime.getTime() - now.getTime()) / 1000);
  //     minTtl = Math.min(minTtl, Math.max(1, timeUntilExpiry));
  //   }
  //
  //   return minTtl;
  // };

  const getOrgPermission: TPermissionServiceFactory["getOrgPermission"] = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    scope,
    actorAuthMethod
  }) => {
    if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
      throw new BadRequestError({
        message: "Invalid actor provided",
        name: "Get org permission"
      });
    }

    if (orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ name: "You are not allowed to access organization resource" });
    }

    const permissionData = await permissionDAL.getPermission({
      scopeData: {
        scope: AccessScope.Organization,
        orgId
      },
      actorId,
      actorType: actor
    });
    if (!permissionData?.length) throw new ForbiddenRequestError({ name: "You are not member of this organization" });

    const rootOrgId = permissionData?.[0]?.rootOrgId;
    const isChild = Boolean(rootOrgId);
    if (scope === OrganizationActionScope.ParentOrganization && isChild) {
      throw new ForbiddenRequestError({ message: `Child organization cannot do this operation` });
    } else if (scope === OrganizationActionScope.ChildOrganization && !isChild) {
      throw new ForbiddenRequestError({ message: `Parent organization cannot do this operation` });
    }

    const permissionFromRoles = permissionData.flatMap((membership) => {
      const activeRoles = membership?.roles
        .filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        )
        .map(({ role, permissions }) => ({ role, permissions }));
      const activeAdditionalPrivileges = membership?.additionalPrivileges
        .filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        )
        .map(({ permissions }) => ({ role: OrgMembershipRole.Custom, permissions }));
      return activeRoles.concat(activeAdditionalPrivileges);
    });

    const hasRole = (role: string) =>
      permissionData.some((memberships) => memberships.roles.some((el) => role === (el.customRoleSlug || el.role)));

    validateOrgSSO(
      actorAuthMethod,
      permissionData?.[0].orgAuthEnforced,
      Boolean(permissionData?.[0].orgGoogleSsoAuthEnforced),
      Boolean(permissionData?.[0].bypassOrgAuthEnabled),
      hasRole(OrgMembershipRole.Admin)
    );

    const permission = createMongoAbility<OrgPermissionSet>(buildOrgPermissionRules(permissionFromRoles), {
      conditionsMatcher
    });

    return {
      permission,
      memberships: permissionData,
      hasRole
    };
  };

  const $checkProjectEnforcement = (projectDetails: TProjects) => {
    return (enforcement: "enforceEncryptedSecretManagerSecretMetadata") => {
      if (enforcement === "enforceEncryptedSecretManagerSecretMetadata") {
        return Boolean(projectDetails.enforceEncryptedSecretManagerSecretMetadata);
      }
      return false;
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
      memberships: [],
      hasRole: () => false,
      hasProjectEnforcement: $checkProjectEnforcement(serviceTokenProject)
    };
  };

  const getProjectPermission: TPermissionServiceFactory["getProjectPermission"] = async ({
    actor: inputActor,
    actorId: inputActorId,
    projectId,
    actorAuthMethod,
    actorOrgId,
    actionProjectType
  }) => {
    let actor = inputActor;
    let actorId = inputActorId;

    if (actor === ActorType.SERVICE) {
      return getServiceTokenProjectPermission({
        serviceTokenId: actorId,
        projectId,
        actorOrgId,
        actionProjectType
      });
    }

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

    if (ActorType.USER !== actor && ActorType.IDENTITY !== actor) {
      throw new BadRequestError({
        message: "Invalid actor provided",
        name: "Get org permission"
      });
    }

    const projectDetails = await projectDAL.findById(projectId);
    if (!projectDetails) {
      throw new NotFoundError({ message: `Project with ${projectId} not found` });
    }

    requestContext.set("projectDetails", {
      id: projectDetails.id,
      name: projectDetails.name,
      slug: projectDetails.slug
    });

    if (projectDetails.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ name: "This project does not belong to your selected organization." });
    }

    if (actionProjectType !== ActionProjectType.Any && actionProjectType !== projectDetails.type) {
      throw new BadRequestError({
        message: `The project is of type ${projectDetails.type}. Operations of type ${actionProjectType} are not allowed.`
      });
    }

    const permissionData = await permissionDAL.getPermission({
      scopeData: {
        scope: AccessScope.Project,
        orgId: projectDetails.orgId,
        projectId
      },
      actorId,
      actorType: actor
    });
    if (!permissionData?.length) throw new ForbiddenRequestError({ name: "You are not member of this project" });

    const permissionFromRoles = permissionData.flatMap((membership) => {
      const activeRoles = membership?.roles
        .filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        )
        .map(({ role, permissions }) => ({ role, permissions }));
      const activeAdditionalPrivileges = membership?.additionalPrivileges
        .filter(
          ({ isTemporary, temporaryAccessEndTime }) =>
            !isTemporary || (isTemporary && temporaryAccessEndTime && new Date() < temporaryAccessEndTime)
        )
        .map(({ permissions }) => ({ role: ProjectMembershipRole.Custom, permissions }));
      return activeRoles.concat(activeAdditionalPrivileges);
    });

    const hasRole = (role: string) =>
      permissionData.some((memberships) => memberships.roles.some((el) => role === (el.customRoleSlug || el.role)));

    validateOrgSSO(
      actorAuthMethod,
      permissionData?.[0].orgAuthEnforced,
      Boolean(permissionData?.[0].orgGoogleSsoAuthEnforced),
      Boolean(permissionData?.[0].bypassOrgAuthEnabled),
      hasRole(ProjectMembershipRole.Admin)
    );

    const rules = buildProjectPermissionRules(permissionFromRoles);
    const templatedRules = handlebars.compile(JSON.stringify(rules), { data: false });
    const unescapedMetadata = objectify(
      permissionData?.[0]?.metadata,
      (i) => i.key,
      (i) => i.value
    );
    const metadataKeyValuePair = escapeHandlebarsMissingDict(unescapedMetadata, "identity.metadata");
    requestContext.set("identityPermissionMetadata", { metadata: unescapedMetadata });

    let username = "";
    if (actor === ActorType.USER) {
      const userDetails = await userDAL.findById(actorId);
      username = userDetails?.username;
    } else {
      const identityDetails = await identityDAL.findById(actorId);
      username = identityDetails?.name;
    }

    const unescapedIdentityAuthInfo = requestContext.get("identityAuthInfo");
    const identityAuthInfo =
      unescapedIdentityAuthInfo?.identityId === actorId && unescapedIdentityAuthInfo
        ? escapeHandlebarsMissingDict(unescapedIdentityAuthInfo as never, "identity.auth")
        : {};

    const interpolateRules = templatedRules(
      {
        identity: {
          id: actorId,
          username,
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
      memberships: permissionData,
      hasRole,
      hasProjectEnforcement: $checkProjectEnforcement(projectDetails)
    };
  };

  const getProjectPermissions: TPermissionServiceFactory["getProjectPermissions"] = async (projectId, orgId) => {
    // fetch user permissions
    const rawUserProjectPermissions = await permissionDAL.getProjectUserPermissions(projectId, orgId);
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
        name: userProjectPermission.username
      };
    });

    // fetch identity permissions
    const rawIdentityProjectPermissions = await permissionDAL.getProjectIdentityPermissions(projectId, orgId);
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
        name: identityProjectPermission.username
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
        name: groupProjectPermission.username
      };
    });

    return {
      userPermissions,
      identityPermissions,
      groupPermissions
    };
  };

  // instead of actor type this will fetch by role slug. meaning it can be the pre defined slugs like
  // admin member or user defined ones like biller etc
  const getOrgPermissionByRoles: TPermissionServiceFactory["getOrgPermissionByRoles"] = async (roles, orgId) => {
    const formattedRoles = roles.map((role) => ({
      name: role,
      isCustom: !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole)
    }));

    const customRoles = formattedRoles.filter((el) => el.isCustom).map((el) => el.name);
    const customRoleDetails = customRoles.length
      ? await roleDAL.find({
          orgId,
          $in: {
            slug: customRoles
          }
        })
      : [];
    if (customRoles.length !== customRoleDetails.length) {
      const missingRoles = customRoles.filter((role) => !customRoleDetails.find((el) => el.slug === role));
      throw new NotFoundError({
        message: `Specified roles '${missingRoles.join(",")}' was not found in the organization with ID '${orgId}'`
      });
    }

    return formattedRoles.map((el) => {
      if (el.isCustom) {
        const roleDetails = customRoleDetails.find((role) => role.slug === el.name);
        return {
          permission: createMongoAbility<OrgPermissionSet>(
            buildOrgPermissionRules([{ role: OrgMembershipRole.Custom, permissions: roleDetails?.permissions || [] }]),
            {
              conditionsMatcher
            }
          ),
          role: roleDetails!
        };
      }

      return {
        permission: createMongoAbility<OrgPermissionSet>(
          buildOrgPermissionRules([{ role: el.name, permissions: [] }]),
          {
            conditionsMatcher
          }
        )
      };
    });
  };

  const getProjectPermissionByRoles: TPermissionServiceFactory["getProjectPermissionByRoles"] = async (
    roles,
    projectId
  ) => {
    const formattedRoles = roles.map((role) => ({
      name: role,
      isCustom: !Object.values(ProjectMembershipRole).includes(role as ProjectMembershipRole)
    }));

    const customRoles = formattedRoles.filter((el) => el.isCustom).map((el) => el.name);
    const customRoleDetails = customRoles.length
      ? await roleDAL.find({
          projectId,
          $in: {
            slug: customRoles
          }
        })
      : [];
    if (customRoles.length !== customRoleDetails.length) {
      const missingRoles = customRoles.filter((role) => !customRoleDetails.find((el) => el.slug === role));
      throw new NotFoundError({
        message: `Specified roles '${missingRoles.join(",")}' was not found in the project with ID '${projectId}'`
      });
    }

    return formattedRoles.map((el) => {
      if (el.isCustom) {
        const roleDetails = customRoleDetails.find((role) => role.slug === el.name);
        return {
          permission: createMongoAbility<ProjectPermissionSet>(
            buildProjectPermissionRules([
              { role: ProjectMembershipRole.Custom, permissions: roleDetails?.permissions || [] }
            ]),
            {
              conditionsMatcher
            }
          ),
          role: roleDetails!
        };
      }

      return {
        permission: createMongoAbility<ProjectPermissionSet>(
          buildProjectPermissionRules([{ role: el.name, permissions: [] }]),
          {
            conditionsMatcher
          }
        )
      };
    });
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
    getOrgPermission,
    getProjectPermission,
    getProjectPermissions,
    getOrgPermissionByRoles,
    getProjectPermissionByRoles,
    checkGroupProjectPermission,
    invalidateProjectPermissionCache
  };
};
