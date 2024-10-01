/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError } from "@casl/ability";
import axios from "axios";
import jwt from "jsonwebtoken";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityOrgDALFactory } from "../identity/identity-org-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TIdentityAwsAuthDALFactory } from "./identity-aws-auth-dal";
import { extractPrincipalArn } from "./identity-aws-auth-fns";
import {
  TAttachAwsAuthDTO,
  TAwsGetCallerIdentityHeaders,
  TGetAwsAuthDTO,
  TGetCallerIdentityResponse,
  TLoginAwsAuthDTO,
  TRevokeAwsAuthDTO,
  TUpdateAwsAuthDTO
} from "./identity-aws-auth-types";

type TIdentityAwsAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityAwsAuthDAL: Pick<TIdentityAwsAuthDALFactory, "findOne" | "transaction" | "create" | "updateById" | "delete">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TIdentityAwsAuthServiceFactory = ReturnType<typeof identityAwsAuthServiceFactory>;

export const identityAwsAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityAwsAuthDAL,
  identityOrgMembershipDAL,
  identityDAL,
  licenseService,
  permissionService
}: TIdentityAwsAuthServiceFactoryDep) => {
  const login = async ({ identityId, iamHttpRequestMethod, iamRequestBody, iamRequestHeaders }: TLoginAwsAuthDTO) => {
    const identityAwsAuth = await identityAwsAuthDAL.findOne({ identityId });
    if (!identityAwsAuth) {
      throw new NotFoundError({ message: "AWS auth method not found for identity, did you configure AWS auth?" });
    }

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityAwsAuth.identityId });

    const headers: TAwsGetCallerIdentityHeaders = JSON.parse(Buffer.from(iamRequestHeaders, "base64").toString());
    const body: string = Buffer.from(iamRequestBody, "base64").toString();

    const {
      data: {
        GetCallerIdentityResponse: {
          GetCallerIdentityResult: { Account, Arn }
        }
      }
    }: { data: TGetCallerIdentityResponse } = await axios({
      method: iamHttpRequestMethod,
      url: headers?.Host ? `https://${headers.Host}` : identityAwsAuth.stsEndpoint,
      headers,
      data: body
    });

    if (identityAwsAuth.allowedAccountIds) {
      // validate if Account is in the list of allowed Account IDs

      const isAccountAllowed = identityAwsAuth.allowedAccountIds
        .split(",")
        .map((accountId) => accountId.trim())
        .some((accountId) => accountId === Account);

      if (!isAccountAllowed)
        throw new UnauthorizedError({
          message: "Access denied: AWS account ID not allowed."
        });
    }

    if (identityAwsAuth.allowedPrincipalArns) {
      // validate if Arn is in the list of allowed Principal ARNs

      const isArnAllowed = identityAwsAuth.allowedPrincipalArns
        .split(",")
        .map((principalArn) => principalArn.trim())
        .some((principalArn) => {
          // convert wildcard ARN to a regular expression: "arn:aws:iam::123456789012:*" -> "^arn:aws:iam::123456789012:.*$"
          // considers exact matches + wildcard matches
          const regex = new RegExp(`^${principalArn.replace(/\*/g, ".*")}$`);
          return regex.test(extractPrincipalArn(Arn));
        });

      if (!isArnAllowed)
        throw new UnauthorizedError({
          message: "Access denied: AWS principal ARN not allowed."
        });
    }

    const identityAccessToken = await identityAwsAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityAwsAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityAwsAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAwsAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityAwsAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityAwsAuth.identityId,
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

    return { accessToken, identityAwsAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachAwsAuth = async ({
    identityId,
    stsEndpoint,
    allowedPrincipalArns,
    allowedAccountIds,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TAttachAwsAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity.authMethod)
      throw new BadRequestError({
        message: "Failed to add AWS Auth to already configured identity"
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

    const identityAwsAuth = await identityAwsAuthDAL.transaction(async (tx) => {
      const doc = await identityAwsAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
          type: "iam",
          stsEndpoint,
          allowedPrincipalArns,
          allowedAccountIds,
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
          authMethod: IdentityAuthMethod.AWS_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityAwsAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateAwsAuth = async ({
    identityId,
    stsEndpoint,
    allowedPrincipalArns,
    allowedAccountIds,
    accessTokenTTL,
    accessTokenMaxTTL,
    accessTokenNumUsesLimit,
    accessTokenTrustedIps,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdateAwsAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AWS_AUTH)
      throw new BadRequestError({
        message: "Failed to update AWS Auth"
      });

    const identityAwsAuth = await identityAwsAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityAwsAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityAwsAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityAwsAuth.accessTokenMaxTTL)
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

    const updatedAwsAuth = await identityAwsAuthDAL.updateById(identityAwsAuth.id, {
      stsEndpoint,
      allowedPrincipalArns,
      allowedAccountIds,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedAwsAuth, orgId: identityMembershipOrg.orgId };
  };

  const getAwsAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAwsAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AWS_AUTH)
      throw new BadRequestError({
        message: "The identity does not have AWS Auth attached"
      });

    const awsIdentityAuth = await identityAwsAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
    return { ...awsIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  const revokeIdentityAwsAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAwsAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new NotFoundError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AWS_AUTH)
      throw new BadRequestError({
        message: "The identity does not have aws auth"
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

    if (!isAtLeastAsPrivileged(permission, rolePermission))
      throw new ForbiddenRequestError({
        message: "Failed to revoke aws auth of identity with more privileged role"
      });

    const revokedIdentityAwsAuth = await identityAwsAuthDAL.transaction(async (tx) => {
      const deletedAwsAuth = await identityAwsAuthDAL.delete({ identityId }, tx);
      await identityDAL.updateById(identityId, { authMethod: null }, tx);
      return { ...deletedAwsAuth?.[0], orgId: identityMembershipOrg.orgId };
    });
    return revokedIdentityAwsAuth;
  };

  return {
    login,
    attachAwsAuth,
    updateAwsAuth,
    getAwsAuth,
    revokeIdentityAwsAuth
  };
};
