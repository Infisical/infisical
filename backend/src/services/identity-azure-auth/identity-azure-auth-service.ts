import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityAzureAuthDALFactory } from "./identity-azure-auth-dal";
import { validateAzureIdentity } from "./identity-azure-auth-fns";
import {
  TAttachAzureAuthDTO,
  TGetAzureAuthDTO,
  TLoginAzureAuthDTO,
  TUpdateAzureAuthDTO
} from "./identity-azure-auth-types";

type TIdentityAzureAuthServiceFactoryDep = {
  identityAzureAuthDAL: TIdentityAzureAuthDALFactory; // TODO: Pick
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityAzureAuthServiceFactory = ReturnType<typeof identityAzureAuthServiceFactory>;

export const identityAzureAuthServiceFactory = ({
  identityAzureAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  identityDAL,
  permissionService,
  licenseService
}: TIdentityAzureAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: azureJwt }: TLoginAzureAuthDTO) => {
    const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId });
    if (!identityAzureAuth) throw new UnauthorizedError();

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityAzureAuth.identityId });
    if (!identityMembershipOrg) throw new UnauthorizedError();

    const azureIdentity = await validateAzureIdentity({
      tenantId: identityAzureAuth.tenantId,
      resource: identityAzureAuth.resource,
      jwt: azureJwt
    });

    if (azureIdentity.tid !== identityAzureAuth.tenantId) throw new UnauthorizedError();

    if (identityAzureAuth.allowedServicePrincipalIds) {
      // validate if the service principal id is in the list of allowed service principal ids

      const isServicePrincipalAllowed = identityAzureAuth.allowedServicePrincipalIds
        .split(",")
        .map((servicePrincipalId) => servicePrincipalId.trim())
        .some((servicePrincipalId) => servicePrincipalId === azureIdentity.appid);

      if (!isServicePrincipalAllowed) throw new UnauthorizedError();
    }

    const identityAccessToken = await identityAzureAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityAzureAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityAzureAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityAzureAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityAzureAuth.identityId,
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

    return { accessToken, identityAzureAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachAzureAuth = async ({
    identityId,
    tenantId,
    resource,
    allowedServicePrincipalIds,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachAzureAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add Azure Auth to already configured identity"
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

    const identityAzureAuth = await identityAzureAuthDAL.transaction(async (tx) => {
      const doc = await identityAzureAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          tenantId,
          resource,
          allowedServicePrincipalIds,
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
          authMethod: IdentityAuthMethod.AZURE_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityAzureAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateAzureAuth = async ({
    identityId,
    tenantId,
    resource,
    allowedServicePrincipalIds,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAzureAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AZURE_AUTH)
      throw new BadRequestError({
        message: "Failed to update Azure Auth"
      });

    const identityGcpAuth = await identityAzureAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityGcpAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityGcpAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityGcpAuth.accessTokenMaxTTL)
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

    const updatedAzureAuth = await identityAzureAuthDAL.updateById(identityGcpAuth.id, {
      tenantId,
      resource,
      allowedServicePrincipalIds,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return {
      ...updatedAzureAuth,
      orgId: identityMembershipOrg.orgId
    };
  };

  const getAzureAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAzureAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AZURE_AUTH)
      throw new BadRequestError({
        message: "The identity does not have Azure Auth attached"
      });

    const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    return { ...identityAzureAuth, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachAzureAuth,
    updateAzureAuth,
    getAzureAuth
  };
};
