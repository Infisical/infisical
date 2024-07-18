import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityGcpAuthDALFactory } from "./identity-gcp-auth-dal";
import { validateIamIdentity, validateIdTokenIdentity } from "./identity-gcp-auth-fns";
import {
  TAttachGcpAuthDTO,
  TGcpIdentityDetails,
  TGetGcpAuthDTO,
  TLoginGcpAuthDTO,
  TRevokeGcpAuthDTO,
  TUpdateGcpAuthDTO
} from "./identity-gcp-auth-types";

type TIdentityGcpAuthServiceFactoryDep = {
  identityGcpAuthDAL: Pick<TIdentityGcpAuthDALFactory, "findOne" | "transaction" | "create" | "updateById" | "delete">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityGcpAuthServiceFactory = ReturnType<typeof identityGcpAuthServiceFactory>;

export const identityGcpAuthServiceFactory = ({
  identityGcpAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  identityDAL,
  permissionService,
  licenseService
}: TIdentityGcpAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: gcpJwt }: TLoginGcpAuthDTO) => {
    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });
    if (!identityGcpAuth) throw new UnauthorizedError();

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityGcpAuth.identityId });
    if (!identityMembershipOrg) throw new UnauthorizedError();

    let gcpIdentityDetails: TGcpIdentityDetails;
    switch (identityGcpAuth.type) {
      case "gce": {
        gcpIdentityDetails = await validateIdTokenIdentity({
          identityId,
          jwt: gcpJwt
        });
        break;
      }
      case "iam": {
        gcpIdentityDetails = await validateIamIdentity({
          identityId,
          jwt: gcpJwt
        });
        break;
      }
      default: {
        throw new BadRequestError({ message: "Invalid GCP Auth type" });
      }
    }

    if (identityGcpAuth.allowedServiceAccounts) {
      // validate if the service account is in the list of allowed service accounts

      const isServiceAccountAllowed = identityGcpAuth.allowedServiceAccounts
        .split(",")
        .map((serviceAccount) => serviceAccount.trim())
        .some((serviceAccount) => serviceAccount === gcpIdentityDetails.email);

      if (!isServiceAccountAllowed)
        throw new ForbiddenRequestError({
          message: "Access denied: GCP service account not allowed."
        });
    }

    if (identityGcpAuth.type === "gce" && identityGcpAuth.allowedProjects && gcpIdentityDetails.computeEngineDetails) {
      // validate if the project that the service account belongs to is in the list of allowed projects

      const isProjectAllowed = identityGcpAuth.allowedProjects
        .split(",")
        .map((project) => project.trim())
        .some((project) => project === gcpIdentityDetails.computeEngineDetails?.project_id);

      if (!isProjectAllowed)
        throw new ForbiddenRequestError({
          message: "Access denied: GCP project not allowed."
        });
    }

    if (identityGcpAuth.type === "gce" && identityGcpAuth.allowedZones && gcpIdentityDetails.computeEngineDetails) {
      const isZoneAllowed = identityGcpAuth.allowedZones
        .split(",")
        .map((zone) => zone.trim())
        .some((zone) => zone === gcpIdentityDetails.computeEngineDetails?.zone);

      if (!isZoneAllowed)
        throw new ForbiddenRequestError({
          message: "Access denied: GCP zone not allowed."
        });
    }

    const identityAccessToken = await identityGcpAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityGcpAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityGcpAuth.accessTokenTTL,
          accessTokenMaxTTL: identityGcpAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityGcpAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityGcpAuth.identityId,
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

    return { accessToken, identityGcpAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachGcpAuth = async ({
    identityId,
    type,
    allowedServiceAccounts,
    allowedProjects,
    allowedZones,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add GCP Auth to already configured identity"
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

    const identityGcpAuth = await identityGcpAuthDAL.transaction(async (tx) => {
      const doc = await identityGcpAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          type,
          allowedServiceAccounts,
          allowedProjects,
          allowedZones,
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
          authMethod: IdentityAuthMethod.GCP_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityGcpAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateGcpAuth = async ({
    identityId,
    type,
    allowedServiceAccounts,
    allowedProjects,
    allowedZones,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_AUTH)
      throw new BadRequestError({
        message: "Failed to update GCP Auth"
      });

    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });

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

    const updatedGcpAuth = await identityGcpAuthDAL.updateById(identityGcpAuth.id, {
      type,
      allowedServiceAccounts,
      allowedProjects,
      allowedZones,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return {
      ...updatedGcpAuth,
      orgId: identityMembershipOrg.orgId
    };
  };

  const getGcpAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_AUTH)
      throw new BadRequestError({
        message: "The identity does not have GCP Auth attached"
      });

    const identityGcpAuth = await identityGcpAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    return { ...identityGcpAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityGcpAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeGcpAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_AUTH)
      throw new BadRequestError({
        message: "The identity does not have gcp auth"
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
        message: "Failed to revoke gcp auth of identity with more privileged role"
      });

    const revokedIdentityGcpAuth = await identityGcpAuthDAL.transaction(async (tx) => {
      const deletedGcpAuth = await identityGcpAuthDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
      return { ...deletedGcpAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityGcpAuth;
  };

  return {
    login,
    attachGcpAuth,
    updateGcpAuth,
    getGcpAuth,
    revokeIdentityGcpAuth
  };
};
