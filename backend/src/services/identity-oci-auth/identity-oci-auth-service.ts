/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";
import RE2 from "re2";

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
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityOciAuthDALFactory } from "./identity-oci-auth-dal";
import {
  TAttachOciAuthDTO,
  TGetOciAuthDTO,
  TLoginOciAuthDTO,
  TOciGetUserResponse,
  TRevokeOciAuthDTO,
  TUpdateOciAuthDTO
} from "./identity-oci-auth-types";
import { TOrgDALFactory } from "../org/org-dal";

type TIdentityOciAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityOciAuthDAL: Pick<TIdentityOciAuthDALFactory, "findOne" | "transaction" | "create" | "updateById" | "delete">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityOciAuthServiceFactory = ReturnType<typeof identityOciAuthServiceFactory>;

export const identityOciAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityOciAuthDAL,
  identityOrgMembershipDAL,
  licenseService,
  permissionService,
  orgDAL
}: TIdentityOciAuthServiceFactoryDep) => {
  const login = async ({ identityId, headers, userOcid }: TLoginOciAuthDTO) => {
    const identityOciAuth = await identityOciAuthDAL.findOne({ identityId });
    if (!identityOciAuth) {
      throw new NotFoundError({ message: "OCI auth method not found for identity, did you configure OCI auth?" });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityOciAuth.identityId });
    if (!identityMembershipOrg) throw new UnauthorizedError({ message: "Identity not attached to a organization" });

    // Validate OCI host format. Ensures that the host is in "identity.<region>.oraclecloud.com" format.
    if (!headers.host || !new RE2("^identity\\.([a-z]{2}-[a-z]+-[1-9])\\.oraclecloud\\.com$").test(headers.host)) {
      throw new BadRequestError({
        message: "Invalid OCI host format. Expected format: identity.<region>.oraclecloud.com"
      });
    }

    const { data } = await request
      .get<TOciGetUserResponse>(`https://${headers.host}/20160918/users/${userOcid}`, {
        headers
      })
      .catch((err: AxiosError) => {
        logger.error(err.response, "OciIdentityLogin: Failed to authenticate with Oracle Cloud");
        throw err;
      });

    if (data.compartmentId !== identityOciAuth.tenancyOcid) {
      throw new UnauthorizedError({
        message: "Access denied: OCI account isn't part of tenancy."
      });
    }

    if (identityOciAuth.allowedUsernames) {
      const isAccountAllowed = identityOciAuth.allowedUsernames.split(",").some((name) => name.trim() === data.name);

      if (!isAccountAllowed)
        throw new UnauthorizedError({
          message: "Access denied: OCI account username not allowed."
        });
    }

    // Generate the token
    const identityAccessToken = await identityOciAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.OCI_AUTH,
          lastLoginTime: new Date()
        },
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityOciAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityOciAuth.accessTokenTTL,
          accessTokenMaxTTL: identityOciAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityOciAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.OCI_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityOciAuth.identityId,
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
      identityOciAuth,
      accessToken,
      identityAccessToken,
      identityMembershipOrg
    };
  };

  const attachOciAuth = async ({
    identityId,
    tenancyOcid,
    allowedUsernames,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    isActorSuperAdmin
  }: TAttachOciAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OCI_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add OCI Auth to already configured identity"
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

    const identityOciAuth = await identityOciAuthDAL.transaction(async (tx) => {
      const doc = await identityOciAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          type: "iam",
          tenancyOcid,
          allowedUsernames,
          accessTokenMaxTTL,
          accessTokenTTL,
          accessTokenNumUsesLimit,
          accessTokenTrustedIps: JSON.stringify(reformattedAccessTokenTrustedIps)
        },
        tx
      );
      return doc;
    });
    return { ...identityOciAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateOciAuth = async ({
    identityId,
    tenancyOcid,
    allowedUsernames,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateOciAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OCI_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have OCI Auth attached"
      });
    }

    const identityOciAuth = await identityOciAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityOciAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityOciAuth.accessTokenTTL) > (accessTokenMaxTTL || identityOciAuth.accessTokenMaxTTL)
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

    const updatedOciAuth = await identityOciAuthDAL.updateById(identityOciAuth.id, {
      tenancyOcid,
      allowedUsernames,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedOciAuth, orgId: identityMembershipOrg.orgId };
  };

  const getOciAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetOciAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OCI_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OCI Auth attached"
      });
    }

    const ociIdentityAuth = await identityOciAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    return { ...ociIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityOciAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeOciAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.OCI_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have OCI auth"
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

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);
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
          "Failed to revoke OCI auth of identity with more privileged role",
          shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityOciAuth = await identityOciAuthDAL.transaction(async (tx) => {
      const deletedOciAuth = await identityOciAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.OCI_AUTH }, tx);

      return { ...deletedOciAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityOciAuth;
  };

  return {
    login,
    attachOciAuth,
    updateOciAuth,
    getOciAuth,
    revokeIdentityOciAuth
  };
};
