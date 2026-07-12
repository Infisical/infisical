import { createMongoAbility, ForbiddenError, MongoAbility, RawRuleOf, subject } from "@casl/ability";
import { PackRule, packRules, unpackRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ResourceMembershipRole,
  ResourceType,
  ServiceTokenScopes,
  TProjects
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { PamResourceRole } from "@app/ee/services/pam/pam-enums";
import {
  applicationAdminPermissions,
  applicationAuditorPermissions,
  applicationOperatorPermissions,
  cryptographicOperatorPermissions,
  pamResourceAdminPermissions,
  pamResourceAuditorPermissions,
  pamResourceConnectorPermissions,
  projectAdminApplicationFallbackPermissions,
  projectAdminPermissions,
  projectAdminSignerFallbackPermissions,
  projectMemberPermissions,
  projectNoAccessPermissions,
  projectViewerPermission,
  signerAdminPermissions,
  signerAuditorPermissions,
  signerOperatorPermissions,
  sshHostBootstrapPermissions
} from "@app/ee/services/permission/default-roles";
import { ResourcePermissionSet } from "@app/ee/services/permission/resource-permission";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";
import { conditionsMatcher } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { objectify } from "@app/lib/fn";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TAdditionalPrivilegeDALFactory } from "@app/services/additional-privilege/additional-privilege-dal";
import { ActorType } from "@app/services/auth/auth-type";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import {
  applyOauthScopeToOrgRules,
  applyOauthScopeToProjectRules,
  isValidOauthScope,
  OauthScope
} from "@app/services/oauth-client/oauth-scope";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";
import { TServiceTokenDALFactory } from "@app/services/service-token/service-token-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import {
  orgAdminPermissions,
  orgMemberPermissions,
  orgNoAccessPermissions,
  OrgPermissionSet,
  OrgPermissionSsoActions,
  OrgPermissionSubjects
} from "./org-permission";
import { TPermissionDALFactory } from "./permission-dal";
import {
  escapeHandlebarsMissingDict,
  expandLegacyForbidActions,
  handlebarsClient,
  validateOrgSSO
} from "./permission-fns";
import {
  TBuildOrgPermissionDTO,
  TBuildProjectPermissionDTO,
  TGetServiceTokenProjectPermissionArg,
  TPermissionServiceFactory
} from "./permission-service-types";
import {
  buildServiceTokenProjectPermission,
  ProjectPermissionIdentityActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "./project-permission";

// Returns the delegated OAuth scopes for the current request, or undefined when this is not an
// OAuth-delegated request. The distinction matters: a returned array (even empty) means scope
// narrowing applies, while undefined means a first-party session / background job is untouched.
const getDelegatedOauthScopes = (): OauthScope[] | undefined => {
  const raw = requestContext.get(RequestContextKey.OauthScopes);
  if (!raw) return undefined;
  // The scopes were validated at consent time, but re-coerce defensively against the catalog.
  return raw.filter(isValidOauthScope);
};

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
    .reduce((prev, curr) => prev.concat(curr), [])
    .sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));

  return rules;
};

const buildProjectPermissionRules = (projectUserRoles: TBuildProjectPermissionDTO) => {
  const rules = expandLegacyForbidActions(
    projectUserRoles
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
      .reduce((prev, curr) => prev.concat(curr), [] as RawRuleOf<MongoAbility<ProjectPermissionSet>>[])
  ).sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));

  return rules;
};

export const resolveResourceRoleRules = (resourceType: ResourceType, role: string) => {
  if (resourceType === ResourceType.Signer) {
    switch (role) {
      case ResourceMembershipRole.Admin:
        return signerAdminPermissions;
      case ResourceMembershipRole.Operator:
        return signerOperatorPermissions;
      case ResourceMembershipRole.Auditor:
        return signerAuditorPermissions;
      case ResourceMembershipRole.Custom:
        throw new BadRequestError({ message: "Custom resource-level roles are not supported yet" });
      default:
        throw new NotFoundError({ name: "SignerRoleInvalid", message: `Signer role '${role}' not found` });
    }
  }

  if (resourceType === ResourceType.PamFolder || resourceType === ResourceType.PamAccount) {
    switch (role) {
      case PamResourceRole.Admin:
        return pamResourceAdminPermissions;
      case PamResourceRole.Connector:
        return pamResourceConnectorPermissions;
      case PamResourceRole.Auditor:
        return pamResourceAuditorPermissions;
      default:
        throw new NotFoundError({ name: "PamRoleInvalid", message: `PAM role '${role}' not found` });
    }
  }

  switch (role) {
    case ResourceMembershipRole.Admin:
      return applicationAdminPermissions;
    case ResourceMembershipRole.Operator:
      return applicationOperatorPermissions;
    case ResourceMembershipRole.Auditor:
      return applicationAuditorPermissions;
    case ResourceMembershipRole.Custom:
      throw new BadRequestError({ message: "Custom resource-level roles are not supported yet" });
    default:
      throw new NotFoundError({
        name: "ApplicationRoleInvalid",
        message: `Application role '${role}' not found`
      });
  }
};

const buildResourcePermissionRules = (appUserRoles: TBuildProjectPermissionDTO, resourceType: ResourceType) => {
  const rules = appUserRoles
    .map(({ role }) => resolveResourceRoleRules(resourceType, role))
    .reduce((prev, curr) => prev.concat(curr), [] as RawRuleOf<MongoAbility<ResourcePermissionSet>>[])
    .sort((a, b) => Number(Boolean(a.inverted)) - Number(Boolean(b.inverted)));

  return rules;
};

const resolveResourceProjectAdminFallback = (resourceType: ResourceType) => {
  if (resourceType === ResourceType.Signer) return projectAdminSignerFallbackPermissions;
  if (resourceType === ResourceType.PamFolder || resourceType === ResourceType.PamAccount) return [];
  return projectAdminApplicationFallbackPermissions;
};

type MembershipWithRoles = {
  roles?: Array<{
    role: string;
    permissions?: unknown;
    isTemporary?: boolean;
    temporaryAccessEndTime?: Date | null;
  }>;
  additionalPrivileges?: Array<{
    permissions?: unknown;
    isTemporary?: boolean;
    temporaryAccessEndTime?: Date | null;
  }>;
};

const isActiveRole = <U extends { isTemporary?: boolean; temporaryAccessEndTime?: Date | null }>(role: U): boolean =>
  !role.isTemporary ||
  Boolean(role.isTemporary && role.temporaryAccessEndTime && new Date() < role.temporaryAccessEndTime);

export const flattenActiveRolesFromMemberships = <T extends string>(
  memberships: MembershipWithRoles[],
  customRoleValue: T
): { role: string; permissions?: unknown }[] => {
  return memberships.flatMap((membership) => {
    const activeRoles = (membership?.roles ?? [])
      .filter(isActiveRole)
      .map(({ role, permissions }) => ({ role, permissions }));
    const activeAdditionalPrivileges = (membership?.additionalPrivileges ?? [])
      .filter(isActiveRole)
      .map(({ permissions }) => ({ role: customRoleValue, permissions }));
    return activeRoles.concat(activeAdditionalPrivileges);
  });
};

const membershipsHaveActiveRole = (
  memberships: Array<{
    roles: Array<{
      role: string;
      customRoleSlug?: string | null;
      isTemporary?: boolean;
      temporaryAccessEndTime?: Date | null;
    }>;
  }>,
  role: string
): boolean => memberships.some((m) => m.roles.some((r) => role === (r.customRoleSlug || r.role) && isActiveRole(r)));

type TPermissionServiceFactoryDep = {
  serviceTokenDAL: Pick<TServiceTokenDALFactory, "findById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  permissionDAL: TPermissionDALFactory;
  keyStore: TKeyStoreFactory;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  roleDAL: Pick<TRoleDALFactory, "find">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "find">;
  groupDAL: Pick<TGroupDALFactory, "find">;
};

export const permissionServiceFactory = ({
  permissionDAL,
  serviceTokenDAL,
  projectDAL,
  userDAL,
  identityDAL,
  keyStore,
  roleDAL,
  additionalPrivilegeDAL,
  groupDAL
}: TPermissionServiceFactoryDep): TPermissionServiceFactory => {
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
      throw new ForbiddenRequestError({
        message: `Your token is scoped to organization with ID ${actorOrgId}, but this resource belongs to a different organization.`
      });
    }

    // Request-scoped memoization: deduplicates org permission checks within the same request
    const memoKey = requestMemoKeys.orgPermission({
      orgId,
      actor,
      actorId,
      actorAuthMethod,
      scope
    });
    return requestMemoize(memoKey, async () => {
      const permissionData = await permissionDAL.getPermission({
        scopeData: {
          scope: AccessScope.Organization,
          orgId
        },
        actorId,
        actorType: actor
      });
      if (!permissionData?.length)
        throw new ForbiddenRequestError({
          message: `You are not a member of this organization with ID ${actorOrgId}. Please assign this ${actor} to the organization with the appropriate permissions, then try again.`
        });

      const rootOrgId = permissionData?.[0]?.rootOrgId;
      const isChild = Boolean(rootOrgId);
      if (scope === OrganizationActionScope.ParentOrganization && isChild) {
        throw new ForbiddenRequestError({ message: `Child organization cannot do this operation` });
      } else if (scope === OrganizationActionScope.ChildOrganization && !isChild) {
        throw new ForbiddenRequestError({ message: `Parent organization cannot do this operation` });
      }

      const permissionFromRoles = flattenActiveRolesFromMemberships(permissionData, OrgMembershipRole.Custom);

      const hasRole = (role: string) => membershipsHaveActiveRole(permissionData, role);

      const fullPermission = createMongoAbility<OrgPermissionSet>(buildOrgPermissionRules(permissionFromRoles), {
        conditionsMatcher
      });

      const canBypassSso = fullPermission.can(OrgPermissionSsoActions.BypassSsoEnforcement, OrgPermissionSubjects.Sso);

      // SSO enforcement applies only to users. Evaluate it against the full ability — SSO bypass is a
      // property of the user's roles, not of what an OAuth client was delegated.
      if (actor === ActorType.USER) {
        validateOrgSSO(
          actorAuthMethod,
          permissionData?.[0].orgAuthEnforced,
          Boolean(permissionData?.[0].orgGoogleSsoAuthEnforced),
          Boolean(permissionData?.[0].bypassOrgAuthEnabled),
          canBypassSso
        );
      }

      // Delegated OAuth tokens get a scope-narrowed ability; first-party sessions get the full one.
      const oauthScopes = getDelegatedOauthScopes();
      const permission = oauthScopes
        ? createMongoAbility<OrgPermissionSet>(applyOauthScopeToOrgRules(fullPermission.rules, oauthScopes), {
            conditionsMatcher
          })
        : fullPermission;

      return {
        permission,
        memberships: permissionData,
        hasRole
      };
    });
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

    const serviceTokenProject = await requestMemoize(requestMemoKeys.projectFindById(serviceToken.projectId), () =>
      projectDAL.findById(serviceToken.projectId)
    );

    if (!serviceTokenProject) throw new BadRequestError({ message: "Service token not linked to a project" });

    if (serviceToken.projectId !== projectId) {
      throw new ForbiddenRequestError({
        message: `Service token not a part of the specified project with ID ${projectId}`
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

  const reviveCachedPermissionDates = (
    memberships: {
      roles?: { temporaryAccessEndTime?: string | Date | null }[];
      additionalPrivileges?: { temporaryAccessEndTime?: string | Date | null }[];
    }[]
  ) => {
    for (const membership of memberships) {
      for (const role of membership.roles ?? []) {
        if (role.temporaryAccessEndTime) {
          role.temporaryAccessEndTime = new Date(role.temporaryAccessEndTime);
        }
      }
      for (const priv of membership.additionalPrivileges ?? []) {
        if (priv.temporaryAccessEndTime) {
          priv.temporaryAccessEndTime = new Date(priv.temporaryAccessEndTime);
        }
      }
    }
  };

  type TCachedProjectPermission = {
    permissionData: Awaited<ReturnType<TPermissionDALFactory["getPermission"]>>;
    projectDetails: TProjects;
    username: string;
    canBypassSso: boolean;
  };

  const $fetchProjectPermissionData = async (
    projectId: string,
    actorOrgId: string | undefined,
    actionProjectType: ActionProjectType,
    actor: ActorType.USER | ActorType.IDENTITY,
    actorId: string
  ): Promise<TCachedProjectPermission> => {
    const projectDetails = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    if (!projectDetails) {
      throw new NotFoundError({ message: `Project with ${projectId} not found` });
    }

    if (projectDetails.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "This project does not belong to your selected organization." });
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
    if (!permissionData?.length)
      throw new ForbiddenRequestError({
        name: "ProjectMembershipNotFound",
        message: `You are not a member of this project with ID ${projectId}. Please assign this ${actor} to the project with the appropriate permissions, then try again.`
      });

    let username = "";
    if (actor === ActorType.USER) {
      const userDetails = await requestMemoize(requestMemoKeys.userFindById(actorId), () => userDAL.findById(actorId));
      username = userDetails?.username ?? "";
    } else {
      const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(actorId), () =>
        identityDAL.findById(actorId)
      );
      username = identityDetails?.name ?? "";
    }

    // SSO bypass check (for USER actors) — pre-compute and cache the boolean
    let canBypassSso = false;
    if (actor === ActorType.USER) {
      const enforceSsoAndBypassEnabled =
        permissionData?.[0].orgAuthEnforced ||
        (permissionData?.[0].orgGoogleSsoAuthEnforced && permissionData?.[0].bypassOrgAuthEnabled);

      if (enforceSsoAndBypassEnabled) {
        const orgIdForBypass = permissionData?.[0].rootOrgId ?? projectDetails.orgId;
        const orgPermissionData = await permissionDAL.getPermission({
          scopeData: { scope: AccessScope.Organization, orgId: orgIdForBypass },
          actorId,
          actorType: ActorType.USER
        });
        if (orgPermissionData?.length) {
          const orgPermissionFromRoles = flattenActiveRolesFromMemberships(orgPermissionData, OrgMembershipRole.Custom);
          const orgPermission = createMongoAbility<OrgPermissionSet>(buildOrgPermissionRules(orgPermissionFromRoles), {
            conditionsMatcher
          });
          canBypassSso = orgPermission.can(OrgPermissionSsoActions.BypassSsoEnforcement, OrgPermissionSubjects.Sso);
        }
      }
    }

    return { permissionData, projectDetails, username, canBypassSso };
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

    if (!actorOrgId) {
      throw new BadRequestError({ message: "Organization context is required for project permission checks" });
    }

    if (actor === ActorType.SERVICE) {
      return getServiceTokenProjectPermission({
        serviceTokenId: actorId,
        projectId,
        actorOrgId,
        actionProjectType
      });
    }

    const assumedPrivilegeDetailsCtx = requestContext.get(RequestContextKey.AssumedPrivilegeDetails);
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
    const narrowedActor: ActorType.USER | ActorType.IDENTITY = actor;

    // Request-scoped full-function memoization: identical permission checks within the same request
    const memoKey = requestMemoKeys.projectPermission({
      projectId,
      actor,
      actorId,
      actorAuthMethod,
      actionProjectType,
      actorOrgId
    });
    const memoizer = requestContext.get(RequestContextKey.Memoizer);

    type TProjectPermissionMemoPayload = {
      result: Awaited<ReturnType<TPermissionServiceFactory["getProjectPermission"]>>;
      projectDetailsCtx: { id: string; name: string; slug: string };
      identityPermissionMetadataCtx: Record<string, unknown>;
    };

    const loadProjectPermission = async (): Promise<TProjectPermissionMemoPayload> => {
      // Layer 2: Redis fingerprint cache (marker 10s + data 10m)
      const cached: TCachedProjectPermission = await withCacheFingerprint<TCachedProjectPermission>({
        keyStore,
        dataKey: KeyStorePrefixes.ProjectPermissionData(projectId, narrowedActor, actorId, actionProjectType),
        markerKey: KeyStorePrefixes.ProjectPermissionMarker(projectId, narrowedActor, actorId, actionProjectType),
        markerTtlSeconds: KeyStoreTtls.ProjectPermissionMarkerTtlSeconds,
        dataTtlSeconds: KeyStoreTtls.ProjectPermissionDataTtlSeconds,
        fingerprintFetcher: () =>
          permissionDAL.getPermissionFingerprint({
            projectId,
            orgId: actorOrgId,
            actorId,
            actorType: narrowedActor
          }),
        dataFetcher: () =>
          $fetchProjectPermissionData(projectId, actorOrgId, actionProjectType, narrowedActor, actorId),
        reviver: (parsed: TCachedProjectPermission) => {
          reviveCachedPermissionDates(parsed.permissionData);
        }
      });

      const { permissionData, projectDetails, username, canBypassSso } = cached;

      if (projectDetails.orgId !== actorOrgId) {
        throw new ForbiddenRequestError({ message: "This project does not belong to your selected organization." });
      }
      if (actionProjectType !== ActionProjectType.Any && actionProjectType !== projectDetails.type) {
        throw new BadRequestError({
          message: `The project is of type ${projectDetails.type}. Operations of type ${actionProjectType} are not allowed.`
        });
      }

      const projectDetailsCtx = {
        id: projectDetails.id,
        name: projectDetails.name,
        slug: projectDetails.slug
      };

      const permissionFromRoles = flattenActiveRolesFromMemberships(permissionData, ProjectMembershipRole.Custom);

      const hasRole = (role: string) => membershipsHaveActiveRole(permissionData, role);

      // SSO enforcement runs on every request (uses per-request actorAuthMethod, not cached)
      if (actor === ActorType.USER) {
        validateOrgSSO(
          actorAuthMethod,
          permissionData?.[0].orgAuthEnforced,
          Boolean(permissionData?.[0].orgGoogleSsoAuthEnforced),
          Boolean(permissionData?.[0].bypassOrgAuthEnabled),
          canBypassSso
        );
      }

      const rules = buildProjectPermissionRules(permissionFromRoles);
      const templatedRules = handlebarsClient.compile(JSON.stringify(rules), { data: false });
      const unescapedMetadata = objectify(
        permissionData?.[0]?.metadata,
        (i) => i.key,
        (i) => i.value
      );
      const metadataKeyValuePair = escapeHandlebarsMissingDict(unescapedMetadata, "identity.metadata");
      const identityPermissionMetadataCtx = { metadata: unescapedMetadata };

      const unescapedIdentityAuthInfo = requestContext.get(RequestContextKey.IdentityAuthInfo);
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

      const result = {
        permission,
        memberships: permissionData,
        hasRole,
        hasProjectEnforcement: $checkProjectEnforcement(projectDetails)
      };

      return {
        result,
        projectDetailsCtx,
        identityPermissionMetadataCtx
      };
    };

    // Layer 1: in-memory per-request memoization → Layer 2: Redis fingerprint cache → Layer 3: DB
    const payload = memoizer ? await memoizer.getOrSet(memoKey, loadProjectPermission) : await loadProjectPermission();

    requestContext.set(RequestContextKey.ProjectDetails, payload.projectDetailsCtx);
    requestContext.set(RequestContextKey.IdentityPermissionMetadata, payload.identityPermissionMetadataCtx);

    // Narrow the ability for delegated OAuth tokens. Applied here, outside the (cross-request) cache
    // boundary, so the cached payload always holds the full ability and only this request is scoped.
    const oauthScopes = getDelegatedOauthScopes();
    if (!oauthScopes) return payload.result;

    return {
      ...payload.result,
      permission: createMongoAbility<ProjectPermissionSet>(
        applyOauthScopeToProjectRules(payload.result.permission.rules, oauthScopes),
        { conditionsMatcher }
      )
    };
  };

  const getResourcePermission: TPermissionServiceFactory["getResourcePermission"] = async ({
    actor,
    actorId,
    projectId,
    resourceType,
    resourceId,
    actorAuthMethod,
    actorOrgId
  }) => {
    if (actor !== ActorType.USER && actor !== ActorType.IDENTITY) {
      throw new BadRequestError({
        message: "Invalid actor provided",
        name: "Get resource permission"
      });
    }

    if (!actorOrgId) {
      throw new BadRequestError({ message: "Organization context is required for resource permission checks" });
    }

    const memoKey = requestMemoKeys.resourcePermission({
      projectId,
      resourceType,
      resourceId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId
    });

    return requestMemoize(memoKey, async () => {
      // The v1 OAuth scope catalog does not cover resource-level (e.g. cert-manager) memberships, so
      // a delegated token receives an empty resource ability — any ForbiddenError.from(...) check on
      // it fails. This keeps the strict deny-by-default contract for anything outside granted scopes.
      const oauthScopes = getDelegatedOauthScopes();
      if (oauthScopes) {
        return {
          permission: createMongoAbility<ResourcePermissionSet>([], { conditionsMatcher }),
          memberships: [],
          hasRole: () => false,
          isImplicitAdmin: false
        };
      }

      let isProjectAdmin = false;
      let isProjectMember = false;
      try {
        const projectPerm = await getProjectPermission({
          actor,
          actorId,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actionProjectType:
            resourceType === ResourceType.PamFolder || resourceType === ResourceType.PamAccount
              ? ActionProjectType.PAM
              : ActionProjectType.CertificateManager
        });
        isProjectAdmin = projectPerm.hasRole(ProjectMembershipRole.Admin);
        isProjectMember = true;
      } catch (err) {
        if (!(err instanceof ForbiddenRequestError) || err.name !== "ProjectMembershipNotFound") {
          throw err;
        }
      }

      if (!isProjectMember) {
        await getOrgPermission({
          actor,
          actorId,
          orgId: actorOrgId,
          actorOrgId,
          scope: OrganizationActionScope.Any,
          actorAuthMethod
        });
      }

      const resourceMemberships = await permissionDAL.getResourceMembership({
        projectId,
        resourceType,
        resourceId,
        actorId,
        actorType: actor
      });

      const fallbackRules = resolveResourceProjectAdminFallback(resourceType);

      if (resourceMemberships?.length) {
        const permissionFromRoles = flattenActiveRolesFromMemberships(
          resourceMemberships,
          ResourceMembershipRole.Custom
        );
        const resourceRules = buildResourcePermissionRules(permissionFromRoles, resourceType);
        const mergedRules = isProjectAdmin ? [...resourceRules, ...fallbackRules] : resourceRules;
        const permission = createMongoAbility<ResourcePermissionSet>(mergedRules, { conditionsMatcher });

        const hasRole = (role: string) => membershipsHaveActiveRole(resourceMemberships, role);

        return {
          permission,
          memberships: resourceMemberships,
          hasRole,
          isImplicitAdmin: false
        };
      }

      if (isProjectAdmin) {
        const permission = createMongoAbility<ResourcePermissionSet>(fallbackRules, {
          conditionsMatcher
        });
        return {
          permission,
          memberships: [],
          hasRole: () => false,
          isImplicitAdmin: true
        };
      }

      throw new ForbiddenRequestError({
        message: `You are not a member of this ${resourceType}.`
      });
    });
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
      const templatedRules = handlebarsClient.compile(JSON.stringify(rules), { data: false });
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
        membershipId: userProjectPermission.id,
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
      const templatedRules = handlebarsClient.compile(JSON.stringify(rules), { data: false });
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
        membershipId: identityProjectPermission.id,
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
        membershipId: groupProjectPermission.id,
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
        ),
        role: { name: el.name, slug: el.name }
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

  const getMembershipPermissionAudit: TPermissionServiceFactory["getMembershipPermissionAudit"] = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    targetUserId
  }) => {
    const { permission } = await getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionMemberActions.Read, ProjectPermissionSub.Member);

    const targetMemberships = await permissionDAL.getPermission({
      scopeData: {
        scope: AccessScope.Project,
        orgId: actorOrgId,
        projectId
      },
      actorId: targetUserId,
      actorType: ActorType.USER
    });
    if (!targetMemberships?.length) {
      throw new NotFoundError({
        message: `Target user with ID '${targetUserId}' is not a member of project with ID '${projectId}' [targetUserId=${targetUserId}] [projectId=${projectId}]`
      });
    }

    const groupIds = [...new Set(targetMemberships.filter((m) => m.actorGroupId).map((m) => m.actorGroupId as string))];
    const groupNameById: Record<string, string> = {};
    if (groupIds.length) {
      const groups = await groupDAL.find({ $in: { id: groupIds } });
      groups.forEach((g) => {
        groupNameById[g.id] = g.name;
      });
    }

    const targetPrivileges = await additionalPrivilegeDAL.find({
      projectId,
      actorUserId: targetUserId
    });
    const privilegeNameById: Record<string, string> = {};
    targetPrivileges.forEach((p) => {
      privilegeNameById[p.id] = p.name;
    });

    const sources: Awaited<ReturnType<TPermissionServiceFactory["getMembershipPermissionAudit"]>>["sources"] = [];

    targetMemberships.forEach((membership) => {
      const isGroupInherited = Boolean(membership.actorGroupId);
      const groupId = isGroupInherited ? (membership.actorGroupId as string) : undefined;
      const groupName = groupId ? groupNameById[groupId] : undefined;

      const activeRoles = (membership.roles ?? []).filter(isActiveRole);
      activeRoles.forEach((role) => {
        const isCustom = role.role === ProjectMembershipRole.Custom;
        const builtRules = buildProjectPermissionRules([
          { role: role.role, permissions: isCustom ? role.permissions : [] }
        ]);
        const packedPermissions = packRules(builtRules) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];

        sources.push({
          id: role.id,
          type: isGroupInherited ? "group_role" : "role",
          name: isCustom ? role.customRoleName || role.customRoleSlug || "Custom" : role.role,
          slug: isCustom ? ProjectMembershipRole.Custom : role.role,
          groupId,
          groupName,
          isTemporary: Boolean(role.isTemporary),
          temporaryAccessStartTime: role.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: role.temporaryAccessEndTime?.toISOString(),
          permissions: packedPermissions
        });
      });

      if (isGroupInherited) return;

      const activePrivileges = (membership.additionalPrivileges ?? []).filter(isActiveRole);
      activePrivileges.forEach((priv) => {
        const builtRules = buildProjectPermissionRules([
          { role: ProjectMembershipRole.Custom, permissions: priv.permissions }
        ]);
        const packedPermissions = packRules(builtRules) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];

        sources.push({
          id: priv.id,
          type: "additional_privilege",
          name: privilegeNameById[priv.id] || "Additional Privilege",
          isTemporary: Boolean(priv.isTemporary),
          temporaryAccessStartTime: priv.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: priv.temporaryAccessEndTime?.toISOString(),
          permissions: packedPermissions
        });
      });
    });

    return { sources };
  };

  const getIdentityPermissionAudit: TPermissionServiceFactory["getIdentityPermissionAudit"] = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectId,
    targetIdentityId
  }) => {
    const { permission } = await getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionIdentityActions.Read,
      subject(ProjectPermissionSub.Identity, { identityId: targetIdentityId })
    );

    const targetMemberships = await permissionDAL.getPermission({
      scopeData: {
        scope: AccessScope.Project,
        orgId: actorOrgId,
        projectId
      },
      actorId: targetIdentityId,
      actorType: ActorType.IDENTITY
    });
    if (!targetMemberships?.length) {
      throw new NotFoundError({
        message: `Target identity with ID '${targetIdentityId}' is not a member of project with ID '${projectId}' [targetIdentityId=${targetIdentityId}] [projectId=${projectId}]`
      });
    }

    const groupIds = [...new Set(targetMemberships.filter((m) => m.actorGroupId).map((m) => m.actorGroupId as string))];
    const groupNameById: Record<string, string> = {};
    if (groupIds.length) {
      const groups = await groupDAL.find({ $in: { id: groupIds } });
      groups.forEach((g) => {
        groupNameById[g.id] = g.name;
      });
    }

    const targetPrivileges = await additionalPrivilegeDAL.find({
      projectId,
      actorIdentityId: targetIdentityId
    });
    const privilegeNameById: Record<string, string> = {};
    targetPrivileges.forEach((p) => {
      privilegeNameById[p.id] = p.name;
    });

    const sources: Awaited<ReturnType<TPermissionServiceFactory["getIdentityPermissionAudit"]>>["sources"] = [];

    targetMemberships.forEach((membership) => {
      const isGroupInherited = Boolean(membership.actorGroupId);
      const groupId = isGroupInherited ? (membership.actorGroupId as string) : undefined;
      const groupName = groupId ? groupNameById[groupId] : undefined;

      const activeRoles = (membership.roles ?? []).filter(isActiveRole);
      activeRoles.forEach((role) => {
        const isCustom = role.role === ProjectMembershipRole.Custom;
        const builtRules = buildProjectPermissionRules([
          { role: role.role, permissions: isCustom ? role.permissions : [] }
        ]);
        const packedPermissions = packRules(builtRules) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];

        sources.push({
          id: role.id,
          type: isGroupInherited ? "group_role" : "role",
          name: isCustom ? role.customRoleName || role.customRoleSlug || "Custom" : role.role,
          slug: isCustom ? ProjectMembershipRole.Custom : role.role,
          groupId,
          groupName,
          isTemporary: Boolean(role.isTemporary),
          temporaryAccessStartTime: role.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: role.temporaryAccessEndTime?.toISOString(),
          permissions: packedPermissions
        });
      });

      if (isGroupInherited) return;

      const activePrivileges = (membership.additionalPrivileges ?? []).filter(isActiveRole);
      activePrivileges.forEach((priv) => {
        const builtRules = buildProjectPermissionRules([
          { role: ProjectMembershipRole.Custom, permissions: priv.permissions }
        ]);
        const packedPermissions = packRules(builtRules) as PackRule<RawRuleOf<MongoAbility<ProjectPermissionSet>>>[];

        sources.push({
          id: priv.id,
          type: "additional_privilege",
          name: privilegeNameById[priv.id] || "Additional Privilege",
          isTemporary: Boolean(priv.isTemporary),
          temporaryAccessStartTime: priv.temporaryAccessStartTime?.toISOString(),
          temporaryAccessEndTime: priv.temporaryAccessEndTime?.toISOString(),
          permissions: packedPermissions
        });
      });
    });

    return { sources };
  };

  return {
    getOrgPermission,
    getProjectPermission,
    getResourcePermission,
    getProjectPermissions,
    getOrgPermissionByRoles,
    getProjectPermissionByRoles,
    checkGroupProjectPermission,
    getMembershipPermissionAudit,
    getIdentityPermissionAudit
  };
};
