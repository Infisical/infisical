import { ForbiddenError } from "@casl/ability";

import { IdentityAuthMethod, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOrgDALFactory } from "../org/org-dal";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityTokenAuthDALFactory } from "./identity-token-auth-dal";
import {
  TAttachTokenAuthDTO,
  TCreateTokenAuthTokenDTO,
  TGetTokenAuthDTO,
  TGetTokenAuthTokensDTO,
  TRevokeTokenAuthDTO,
  TRevokeTokenAuthTokenDTO,
  TUpdateTokenAuthDTO,
  TUpdateTokenAuthTokenDTO
} from "./identity-token-auth-types";

type TIdentityTokenAuthServiceFactoryDep = {
  identityTokenAuthDAL: Pick<
    TIdentityTokenAuthDALFactory,
    "transaction" | "create" | "findOne" | "updateById" | "delete"
  >;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  identityAccessTokenDAL: Pick<
    TIdentityAccessTokenDALFactory,
    "create" | "find" | "update" | "findById" | "findOne" | "updateById" | "delete"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityTokenAuthServiceFactory = ReturnType<typeof identityTokenAuthServiceFactory>;

export const identityTokenAuthServiceFactory = ({
  identityTokenAuthDAL,
  // identityDAL,
  identityOrgMembershipDAL,
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

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Token Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
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
          identityId: identityMembershipOrg.identityId,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityTokenAuth, orgId: identityMembershipOrg.orgId };
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

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

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

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const plan = await licenseService.getPlan(identityMembershipOrg.orgId);
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
      orgId: identityMembershipOrg.orgId
    };
  };

  const getTokenAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetTokenAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth attached"
      });
    }

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    return { ...identityTokenAuth, orgId: identityMembershipOrg.orgId };
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

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.orgId);
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

    const revokedIdentityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const deletedTokenAuth = await identityTokenAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({
        identityId,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      });

      return { ...deletedTokenAuth?.[0], orgId: identityMembershipOrg.orgId };
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
    isActorSuperAdmin
  }: TCreateTokenAuthTokenDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.orgId);
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

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const identityAccessToken = await identityTokenAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.TOKEN_AUTH,
          lastLoginTime: new Date()
        },
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
          authMethod: IdentityAuthMethod.TOKEN_AUTH
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

    return { accessToken, identityTokenAuth, identityAccessToken, identityMembershipOrg };
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

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const tokens = await identityAccessTokenDAL.find(
      {
        identityId,
        authMethod: IdentityAuthMethod.TOKEN_AUTH
      },
      { offset, limit, sort: [["updatedAt", "desc"]] }
    );

    return { tokens, identityMembershipOrg };
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

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: foundToken.identityId });
    if (!identityMembershipOrg) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${foundToken.identityId}` });
    }

    await validateIdentityUpdateForSuperAdminPrivileges(foundToken.identityId, isActorSuperAdmin);
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.TOKEN_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    }
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.orgId);
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

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId: identityAccessToken.identityId
    });

    if (!identityOrgMembership) {
      throw new NotFoundError({ message: `Failed to find identity with ID ${identityAccessToken.identityId}` });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

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
    updateTokenAuthToken,
    revokeTokenAuthToken
  };
};
