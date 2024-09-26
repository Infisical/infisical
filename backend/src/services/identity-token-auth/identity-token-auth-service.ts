import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
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
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<
    TIdentityAccessTokenDALFactory,
    "create" | "find" | "update" | "findById" | "findOne" | "updateById"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityTokenAuthServiceFactory = ReturnType<typeof identityTokenAuthServiceFactory>;

export const identityTokenAuthServiceFactory = ({
  identityTokenAuthDAL,
  identityDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService
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
    actorOrgId
  }: TAttachTokenAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add Token Auth to already configured identity"
      });

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);

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
      await identityDAL.updateById(
        identityMembershipOrg.identityId,
        {
          authMethod: IdentityAuthMethod.TOKEN_AUTH
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
    actorOrgId
  }: TUpdateTokenAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "Failed to update Token Auth"
      });

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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

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
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Token Auth attached"
      });

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    return { ...identityTokenAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityTokenAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeTokenAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );

    if (!isAtLeastAsPrivileged(permission, rolePermission)) {
      throw new ForbiddenRequestError({
        message: "Failed to revoke Token Auth of identity with more privileged role"
      });
    }

    const revokedIdentityTokenAuth = await identityTokenAuthDAL.transaction(async (tx) => {
      const deletedTokenAuth = await identityTokenAuthDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
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
    name
  }: TCreateTokenAuthTokenDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to create token for identity with more privileged role"
      });

    const identityTokenAuth = await identityTokenAuthDAL.findOne({ identityId });

    const identityAccessToken = await identityTokenAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityTokenAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityTokenAuth.accessTokenTTL,
          accessTokenMaxTTL: identityTokenAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityTokenAuth.accessTokenNumUsesLimit,
          name
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityTokenAuth.identityId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      {
        expiresIn:
          Number(identityAccessToken.accessTokenMaxTTL) === 0
            ? undefined
            : Number(identityAccessToken.accessTokenMaxTTL)
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
    actorOrgId
  }: TGetTokenAuthTokensDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const tokens = await identityAccessTokenDAL.find(
      {
        identityId
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
    actorOrgId
  }: TUpdateTokenAuthTokenDTO) => {
    const foundToken = await identityAccessTokenDAL.findById(tokenId);
    if (!foundToken) throw new NotFoundError({ message: "Failed to find token" });
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: foundToken.identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.TOKEN_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Token Auth"
      });
    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: rolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      identityMembershipOrg.identityId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const hasPriviledge = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasPriviledge)
      throw new ForbiddenRequestError({
        message: "Failed to update token for identity with more privileged role"
      });

    const [token] = await identityAccessTokenDAL.update(
      {
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
    actorOrgId
  }: TRevokeTokenAuthTokenDTO) => {
    const identityAccessToken = await identityAccessTokenDAL.findOne({
      [`${TableName.IdentityAccessToken}.id` as "id"]: tokenId,
      isAccessTokenRevoked: false
    });
    if (!identityAccessToken)
      throw new NotFoundError({
        message: "Failed to find token"
      });

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({
      identityId: identityAccessToken.identityId
    });

    if (!identityOrgMembership) {
      throw new NotFoundError({ message: "No identity organization membership found" });
    }

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const revokedToken = await identityAccessTokenDAL.updateById(identityAccessToken.id, {
      isAccessTokenRevoked: true
    });

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
