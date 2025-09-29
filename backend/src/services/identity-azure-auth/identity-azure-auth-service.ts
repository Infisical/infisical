import { ForbiddenError } from "@casl/ability";

import { IdentityAuthMethod } from "@app/db/schemas";
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
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityAzureAuthDALFactory } from "./identity-azure-auth-dal";
import { validateAzureIdentity } from "./identity-azure-auth-fns";
import {
  TAttachAzureAuthDTO,
  TGetAzureAuthDTO,
  TLoginAzureAuthDTO,
  TRevokeAzureAuthDTO,
  TUpdateAzureAuthDTO
} from "./identity-azure-auth-types";

type TIdentityAzureAuthServiceFactoryDep = {
  identityAzureAuthDAL: Pick<
    TIdentityAzureAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne" | "updateById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
};

export type TIdentityAzureAuthServiceFactory = ReturnType<typeof identityAzureAuthServiceFactory>;

export const identityAzureAuthServiceFactory = ({
  identityAzureAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService,
  orgDAL
}: TIdentityAzureAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: azureJwt }: TLoginAzureAuthDTO) => {
    const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId });
    if (!identityAzureAuth) {
      throw new NotFoundError({ message: "Azure auth method not found for identity, did you configure Azure Auth?" });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityAzureAuth.identityId });
    if (!identityMembershipOrg) throw new UnauthorizedError({ message: "Identity not attached to a organization" });

    const azureIdentity = await validateAzureIdentity({
      tenantId: identityAzureAuth.tenantId,
      resource: identityAzureAuth.resource,
      jwt: azureJwt
    });

    if (azureIdentity.tid !== identityAzureAuth.tenantId)
      throw new UnauthorizedError({ message: "Tenant ID mismatch" });

    if (identityAzureAuth.allowedServicePrincipalIds) {
      // validate if the service principal id is in the list of allowed service principal ids

      const isServicePrincipalAllowed = identityAzureAuth.allowedServicePrincipalIds
        .split(",")
        .map((servicePrincipalId) => servicePrincipalId.trim())
        .some((servicePrincipalId) => servicePrincipalId === azureIdentity.oid);

      if (!isServicePrincipalAllowed) {
        throw new UnauthorizedError({ message: `Service principal '${azureIdentity.oid}' not allowed` });
      }
    }

    const identityAccessToken = await identityAzureAuthDAL.transaction(async (tx) => {
      await identityOrgMembershipDAL.updateById(
        identityMembershipOrg.id,
        {
          lastLoginAuthMethod: IdentityAuthMethod.AZURE_AUTH,
          lastLoginTime: new Date()
        },
        tx
      );
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityAzureAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityAzureAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityAzureAuth.accessTokenNumUsesLimit,
          authMethod: IdentityAuthMethod.AZURE_AUTH
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = crypto.jwt().sign(
      {
        identityId: identityAzureAuth.identityId,
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
    actorOrgId,
    isActorSuperAdmin
  }: TAttachAzureAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Azure Auth to already configured identity"
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
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "Failed to update Azure Auth"
      });
    }

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
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Azure Auth attached"
      });
    }

    const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    return { ...identityAzureAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityAzureAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAzureAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have azure auth"
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
          "Failed to revoke azure auth of identity with more privileged role",
          shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.RevokeAuth,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const revokedIdentityAzureAuth = await identityAzureAuthDAL.transaction(async (tx) => {
      const deletedAzureAuth = await identityAzureAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.AZURE_AUTH }, tx);

      return { ...deletedAzureAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityAzureAuth;
  };

  return {
    login,
    attachAzureAuth,
    updateAzureAuth,
    getAzureAuth,
    revokeIdentityAzureAuth
  };
};
