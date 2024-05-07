import { ForbiddenError } from "@casl/ability";
import axios from "axios";
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
import { TIdentityGcpIamAuthDALFactory } from "./identity-gcp-iam-auth-dal";
import { extractGcpServiceAccountEmail } from "./identity-gcp-iam-auth-fns";
import {
  TAttachGcpIamAuthDTO,
  TDecodedGcpIamAuthJwt,
  TGetGcpIamAuthDTO,
  TLoginGcpIamAuthDTO,
  TUpdateGcpIamAuthDTO
} from "./identity-gcp-iam-auth-types";

type TIdentityGcpIamAuthServiceFactoryDep = {
  identityGcpIamAuthDAL: Pick<TIdentityGcpIamAuthDALFactory, "findOne" | "transaction" | "create" | "updateById">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TIdentityGcpIamAuthServiceFactory = ReturnType<typeof identityGcpIamAuthServiceFactory>;

export const identityGcpIamAuthServiceFactory = ({
  identityGcpIamAuthDAL,
  identityOrgMembershipDAL,
  identityAccessTokenDAL,
  identityDAL,
  permissionService,
  licenseService
}: TIdentityGcpIamAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: serviceAccountJwt }: TLoginGcpIamAuthDTO) => {
    const identityGcpIamAuth = await identityGcpIamAuthDAL.findOne({ identityId });
    if (!identityGcpIamAuth) throw new UnauthorizedError();

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityGcpIamAuth.identityId });

    const decodedJwt = jwt.decode(serviceAccountJwt, { complete: true }) as TDecodedGcpIamAuthJwt;
    const { sub, aud } = decodedJwt.payload;

    const {
      data
    }: {
      data: {
        [key: string]: string;
      };
    } = await axios.get(`https://www.googleapis.com/service_accounts/v1/metadata/x509/${sub}`);

    const publicKey = data[decodedJwt.header.kid];

    jwt.verify(serviceAccountJwt, publicKey, {
      algorithms: ["RS256"]
    });

    if (aud !== identityId) throw new UnauthorizedError();

    const { name, projectId } = extractGcpServiceAccountEmail(sub);

    if (identityGcpIamAuth.allowedServiceAccounts) {
      // validate if the service account is in the list of allowed service accounts

      const isServiceAccountAllowed = identityGcpIamAuth.allowedServiceAccounts
        .split(",")
        .map((serviceAccount) => serviceAccount.trim())
        .some((serviceAccount) => serviceAccount === name);

      if (!isServiceAccountAllowed) throw new UnauthorizedError();
    }

    if (identityGcpIamAuth.allowedProjects) {
      // validate if the project that the service account belongs to is in the list of allowed projects

      const isProjectAllowed = identityGcpIamAuth.allowedProjects
        .split(",")
        .map((project) => project.trim())
        .some((project) => project === projectId);

      if (!isProjectAllowed) throw new UnauthorizedError();
    }

    const identityAccessToken = await identityGcpIamAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityGcpIamAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityGcpIamAuth.accessTokenTTL,
          accessTokenMaxTTL: identityGcpIamAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityGcpIamAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityGcpIamAuth.identityId,
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

    return { accessToken, identityGcpIamAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachGcpIamAuth = async ({
    identityId,
    allowedServiceAccounts,
    allowedProjects,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachGcpIamAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add AWS IAM Auth to already configured identity"
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

    const identityAwsIamAuth = await identityGcpIamAuthDAL.transaction(async (tx) => {
      const doc = await identityGcpIamAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          allowedServiceAccounts,
          allowedProjects,
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
          authMethod: IdentityAuthMethod.GCP_IAM_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityAwsIamAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateGcpIamAuth = async ({
    identityId,
    allowedServiceAccounts,
    allowedProjects,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateGcpIamAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_IAM_AUTH)
      throw new BadRequestError({
        message: "Failed to update GCP IAM Auth"
      });

    const identityGcpIamAuth = await identityGcpIamAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityGcpIamAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityGcpIamAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || identityGcpIamAuth.accessTokenMaxTTL)
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

    const updatedGcpIamAuth = await identityGcpIamAuthDAL.updateById(identityGcpIamAuth.id, {
      allowedServiceAccounts,
      allowedProjects,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedGcpIamAuth, orgId: identityMembershipOrg.orgId };
  };

  const getGcpIamAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetGcpIamAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.GCP_IAM_AUTH)
      throw new BadRequestError({
        message: "The identity does not have GCP IAM Auth attached"
      });

    const gcpIamIdentityAuth = await identityGcpIamAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
    return { ...gcpIamIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachGcpIamAuth,
    updateGcpIamAuth,
    getGcpIamAuth
  };
};
