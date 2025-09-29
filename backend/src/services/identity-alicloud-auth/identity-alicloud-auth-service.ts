/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityAliCloudAuthDALFactory } from "./identity-alicloud-auth-dal";
import {
  TAliCloudGetUserResponse,
  TAttachAliCloudAuthDTO,
  TGetAliCloudAuthDTO,
  TLoginAliCloudAuthDTO,
  TRevokeAliCloudAuthDTO,
  TUpdateAliCloudAuthDTO
} from "./identity-alicloud-auth-types";

type TIdentityAliCloudAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityAliCloudAuthDAL: Pick<
    TIdentityAliCloudAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityAliCloudAuthServiceFactory = ReturnType<typeof identityAliCloudAuthServiceFactory>;

export const identityAliCloudAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityAliCloudAuthDAL,
  identityOrgMembershipDAL,
  licenseService,
  permissionService,
  orgDAL
}: TIdentityAliCloudAuthServiceFactoryDep) => {
  const login = async ({ identityId, ...params }: TLoginAliCloudAuthDTO) => {
    const identityAliCloudAuth = await identityAliCloudAuthDAL.findOne({ identityId });
    if (!identityAliCloudAuth) {
      throw new NotFoundError({
        message: "Alibaba Cloud auth method not found for identity, did you configure Alibaba Cloud auth?"
      });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({
      identityId: identityAliCloudAuth.identityId
    });

    if (!identityMembershipOrg) throw new UnauthorizedError({ message: "Identity not attached to a organization" });

    const requestUrl = new URL("https://sts.aliyuncs.com");

    for (const key of Object.keys(params)) {
      requestUrl.searchParams.set(key, (params as Record<string, string>)[key]);
    }

    const { data } = await request.get<TAliCloudGetUserResponse>(requestUrl.toString()).catch((err: AxiosError) => {
      logger.error(err.response, "AliCloudIdentityLogin: Failed to authenticate with Alibaba Cloud");
      throw err;
    });

    if (identityAliCloudAuth.allowedArns) {
      // In the future we could do partial checks for role ARNs
      const isAccountAllowed = identityAliCloudAuth.allowedArns.split(",").some((arn) => arn.trim() === data.Arn);

      if (!isAccountAllowed)
        throw new UnauthorizedError({
          message: "Access denied: Alibaba Cloud account ARN not allowed."
        });
    }

    // Generate the token
    const identityAccessToken = await identityAliCloudAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.ALICLOUD_AUTH,
          lastLoginTime: new Date()
        },
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityAliCloudAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityAliCloudAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAliCloudAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityAliCloudAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.ALICLOUD_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityAliCloudAuth.identityId,
        identityAccessTokenId: identityAccessToken.id,
        authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN
      } as TIdentityAccessTokenJwtPayload,
      appCfg.AUTH_SECRET,
      Number(identityAccessToken.accessTokenTTL) === 0
        ? undefined
        : {
            expiresIn: Number(identityAccessToken.accessTokenTTL)
          }
    );

    return {
      identityAliCloudAuth,
      accessToken,
      identityAccessToken,
      identityMembershipOrg
    };
  };

  const attachAliCloudAuth = async ({
    identityId,
    allowedArns,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TAttachAliCloudAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Alibaba Cloud Auth to already configured identity"
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

    const identityAliCloudAuth = await identityAliCloudAuthDAL.transaction(async (tx) => {
      const doc = await identityAliCloudAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          type: "iam",
          allowedArns,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityAliCloudAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateAliCloudAuth = async ({
    identityId,
    allowedArns,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAliCloudAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have Alibaba Cloud Auth attached"
      });
    }

    const identityAliCloudAuth = await identityAliCloudAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityAliCloudAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityAliCloudAuth.accessTokenTTL) >
        (accessTokenMaxTTL || identityAliCloudAuth.accessTokenMaxTTL)
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

    const updatedAliCloudAuth = await identityAliCloudAuthDAL.updateById(identityAliCloudAuth.id, {
      allowedArns,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedAliCloudAuth, orgId: identityMembershipOrg.orgId };
  };

  const getAliCloudAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAliCloudAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Alibaba Cloud Auth attached"
      });
    }

    const alicloudIdentityAuth = await identityAliCloudAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    return { ...alicloudIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityAliCloudAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAliCloudAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Alibaba Cloud auth"
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
          "Failed to revoke Alibaba Cloud auth of identity with more privileged role",
          shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityAliCloudAuth = await identityAliCloudAuthDAL.transaction(async (tx) => {
      const deletedAliCloudAuth = await identityAliCloudAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.ALICLOUD_AUTH }, tx);

      return { ...deletedAliCloudAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityAliCloudAuth;
  };

  return {
    login,
    attachAliCloudAuth,
    updateAliCloudAuth,
    getAliCloudAuth,
    revokeIdentityAliCloudAuth
  };
};
