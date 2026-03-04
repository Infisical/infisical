import { ForbiddenError, subject } from "@casl/ability";

import {
  AccessScope,
  ActionProjectType,
  IdentityAuthMethod,
  OrganizationActionScope,
  TableName
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTokenAuthDALFactory } from "./identity-token-auth-dal";
import {
  TAttachTokenAuthDTO,
  TCreateTokenAuthTokenDTO,
  TGetTokenAuthDTO,
  TGetTokenAuthTokenByIdDTO,
  TGetTokenAuthTokensDTO,
  TRevokeTokenAuthDTO,
  TRevokeTokenAuthTokenDTO,
  TUpdateTokenAuthDTO,
  TUpdateTokenAuthTokenDTO
} from "./identity-token-auth-types";

type TIdentityTokenAuthServiceFactoryDep = {
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityTokenAuthDAL: Pick<
    TIdentityTokenAuthDALFactory,
    "transaction" | "create" | "findOne" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  identityAccessTokenDAL: Pick<
    TIdentityAccessTokenDALFactory,
    "create" | "find" | "update" | "findById" | "findOne" | "updateById" | "delete"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
};

export type TIdentityTokenAuthServiceFactory = ReturnType<typeof identityTokenAuthServiceFactory>;

export const identityTokenAuthServiceFactory = ({
  identityDAL,
  identityTokenAuthDAL,
  membershipIdentityDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService,
  orgDAL
}: TIdentityTokenAuthServiceFactoryDep) => {
  const attachTokenAuth = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TAttachTokenAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Token Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const identityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const doc = await identityTokenAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityTokenAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const updateTokenAuth = async ({
    identityId,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TUpdateTokenAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have token auth"
      });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityTokenAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityTokenAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || identityTokenAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }

    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
    const reformattedAccessTokenTrustedIps = accessTokenTrustedIps?.map((accessTokenTrustedIp) => {
      if (
        !plan.ipAllowlisting &&
        accessTokenTrustedIp.ipAddress !== "0.0.0.0/0" &&
        accessTokenTrustedIp.ipAddress !== "::/0"
      )
        throw new BadRequestError({
          message:
            "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
        });
      if (!isValidIpOrCidr(accessTokenTrustedIp.ipAddress))
        throw new BadRequestError({
          message: "The IP is not a valid IPv4, IPv6, or CIDR block"
        });
      return extractIPDetails(accessTokenTrustedIp.ipAddress);
    });

    const updatedTokenAuth = await identityTokenAuthDAL.updateById(identityTokenAuth.id, {
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return {
      ...updatedTokenAuth,
      orgId: identityMembershipOrg.scopeOrgId
    };
  };

  const getTokenAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetTokenAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new NotFoundError({
        message: "Token Auth configuration not found for identity"
      });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }

    return { ...identityTokenAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityTokenAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    isActorSuperAdmin
  }: TRevokeTokenAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.RevokeAuth,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.RevokeAuth,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to revoke token auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const deletedTokenAuth = await identityTokenAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({
        identityId,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      });

      return { ...deletedTokenAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
    });
    return revokedIdentityTokenAuth;
  };

  const createTokenAuthToken = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    name,
    isActorSuperAdmin,
    organizationSlug
  }: TCreateTokenAuthTokenDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.CreateToken,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.CreateToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create token for identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.CreateToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const identity = await identityDAL.findById(identityTokenAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a organizationSlug is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    if (organizationSlug) {
      if (!isSubOrgIdentity) {
        const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: organizationSlug });

        if (!subOrg) {
          throw new NotFoundError({ message: `Sub organization with slug ${organizationSlug} not found` });
        }

        const subOrgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.IDENTITY,
          actorId: identity.id,
          orgId: subOrg.id
        });

        if (!subOrgMembership) {
          throw new UnauthorizedError({
            message: `Identity not authorized to access sub organization ${organizationSlug}`
          });
        }

        subOrganizationId = subOrg.id;
      }
    }

    const identityAccessToken = await identityTokenAuthDAL.transaction(async (tx) => {
      await membershipIdentityDAL.update(
        identity.projectId
          ? {
              scope: AccessScope.Project,
              scopeOrgId: identity.orgId,
              scopeProjectId: identity.projectId,
              actorIdentityId: identity.id
            }
          : {
              scope: AccessScope.Organization,
              scopeOrgId: identity.orgId,
              actorIdentityId: identity.id
            },
        { lastLoginAuthMethod: IdentityAuthMethod.TOKEN_AUTH, lastLoginTime: new Date() },
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityTokenAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityTokenAuth.accessTokenTTL,
          accessTokenMaxTTL: identityTokenAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityTokenAuth.accessTokenNumUsesLimit,
          name,
          authMethod: IdentityAuthMethod.TOKEN_AUTH,
          subOrganizationId
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityTokenAuth.identityId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
      Number(identityAccessToken.accessTokenTTL) === 0
        ? undefined
        : {
            expiresIn: Number(identityAccessToken.accessTokenTTL)
          }
    );

    return { accessToken, identityTokenAuth, identityAccessToken, identity };
  };

  const getTokenAuthTokens = async ({
    identityId,
    offset = 0,
    limit = 20,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    isActorSuperAdmin
  }: TGetTokenAuthTokensDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }

    const tokens = await identityAccessTokenDAL.find(
      {
        identityId,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    return { tokens, identityMembershipOrg };
  };

  const getTokenAuthTokenById = async ({
    tokenId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TGetTokenAuthTokenByIdDTO) => {
    const foundToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });
    if (!foundToken) throw new NotFoundError({ message: `Token with ID ${tokenId} not found` });

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId: foundToken.identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${foundToken.identityId}` });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId: identityMembershipOrg.identity.id })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }

    return { token: foundToken, identityMembershipOrg };
  };

  const updateTokenAuthToken = async ({
    tokenId,
    name,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    isActorSuperAdmin
  }: TUpdateTokenAuthTokenDTO) => {
    const foundToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });
    if (!foundToken) throw new NotFoundError({ message: `Token with ID ${tokenId} not found` });

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId: foundToken.identityId
    });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${foundToken.identityId}` });
    }

    await validateIdentityUpdateForSuperAdminPrivileges(foundToken.identityId, isActorSuperAdmin);
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.CreateToken,
        subject(ProjectPermissionSub.Identity, { identityId: identityMembershipOrg.identity.id })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.CreateToken,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update token for identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.CreateToken,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const [token] = await identityAccessTokenDAL.update(
      {
        authMethod: IdentityAuthMethod.TOKEN_AUTH,
        identityId: foundToken.identityId,
        id: tokenId
      },
      {
        name
      }
    );

    return { token, identityMembershipOrg };
  };

  const revokeTokenAuthToken = async ({
    tokenId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    isActorSuperAdmin
  }: TRevokeTokenAuthTokenDTO) => {
    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      [`${TableName.IdentityAccessToken}.isAccessTokenRevoked` as "isAccessTokenRevoked"]: false,
      [`${TableName.IdentityAccessToken}.authMethod` as "authMethod"]: IdentityAuthMethod.TOKEN_AUTH
    });

    if (!identityAccessToken)
      throw new NotFoundError({
        message: `Token with ID ${tokenId} not found or already revoked`
      });

    await validateIdentityUpdateForSuperAdminPrivileges(identityAccessToken.identityId, isActorSuperAdmin);

    const identityOrgMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId: identityAccessToken.identityId
    });

    if (!identityOrgMembership) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityAccessToken.identityId}` });
    }

    if (identityOrgMembership.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityOrgMembership.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId: identityOrgMembership.identity.id })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityOrgMembership.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }

    const [revokedToken] = await identityAccessTokenDAL.update(
      {
        id: identityAccessToken.id,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      },
      {
        isAccessTokenRevoked: true
      }
    );

    return { revokedToken };
  };

  return {
    attachTokenAuth,
    updateTokenAuth,
    getTokenAuth,
    revokeIdentityTokenAuth,
    createTokenAuthToken,
    getTokenAuthTokens,
    getTokenAuthTokenById,
    updateTokenAuthToken,
    revokeTokenAuthToken
  };
};
