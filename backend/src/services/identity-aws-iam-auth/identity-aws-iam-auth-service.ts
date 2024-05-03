/* eslint-disable @typescript-eslint/no-unsafe-assignment */
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
import { extractPrincipalArn } from "./identity-aws-iam-auth.fns";
import { TIdentityAwsIamAuthDALFactory } from "./identity-aws-iam-auth-dal";
import {
  TAttachAWSIAMAuthDTO,
  TAWSGetCallerIdentityHeaders,
  TGetAWSIAMAuthDTO,
  TGetCallerIdentityResponse,
  TLoginAWSIAMAuthDTO,
  TUpdateAWSIAMAuthDTO
} from "./identity-aws-iam-auth-types";

type TIdentityAwsIamAuthServiceFactoryDep = {
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create">;
  identityAwsIamAuthDAL: Pick<TIdentityAwsIamAuthDALFactory, "findOne" | "transaction" | "create" | "updateById">;
  identityOrgMembershipDAL: Pick<TIdentityOrgDALFactory, "findOne">;
  identityDAL: Pick<TIdentityDALFactory, "updateById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TIdentityAwsIamAuthServiceFactory = ReturnType<typeof identityAwsIamAuthServiceFactory>;

export const identityAwsIamAuthServiceFactory = ({
  identityAccessTokenDAL,
  identityAwsIamAuthDAL,
  identityOrgMembershipDAL,
  identityDAL,
  licenseService,
  permissionService
}: TIdentityAwsIamAuthServiceFactoryDep) => {
  const login = async ({
    identityId,
    iamHttpRequestMethod,
    iamRequestBody,
    iamRequestHeaders
  }: TLoginAWSIAMAuthDTO) => {
    const identityAwsIamAuth = await identityAwsIamAuthDAL.findOne({ identityId });
    if (!identityAwsIamAuth) throw new UnauthorizedError();

    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId: identityAwsIamAuth.identityId });

    const headers: TAWSGetCallerIdentityHeaders = JSON.parse(Buffer.from(iamRequestHeaders, "base64").toString());
    const body: string = Buffer.from(iamRequestBody, "base64").toString();

    const {
      data: {
        GetCallerIdentityResponse: {
          GetCallerIdentityResult: { Account, Arn }
        }
      }
    }: { data: TGetCallerIdentityResponse } = await axios({
      method: iamHttpRequestMethod,
      url: identityAwsIamAuth.stsEndpoint,
      headers,
      data: body
    });

    if (identityAwsIamAuth.allowedAccountIds) {
      // validate if Account is in the list of allowed Account IDs

      const isAccountAllowed = identityAwsIamAuth.allowedAccountIds
        .split(",")
        .map((accountId) => accountId.trim())
        .some((accountId) => accountId === Account);

      if (!isAccountAllowed) throw new UnauthorizedError();
    }

    if (identityAwsIamAuth.allowedPrincipalArns) {
      // validate if Arn is in the list of allowed Principal ARNs

      const isArnAllowed = identityAwsIamAuth.allowedPrincipalArns
        .split(",")
        .map((principalArn) => principalArn.trim())
        .some((principalArn) => {
          // convert wildcard ARN to a regular expression: "arn:aws:iam::123456789012:*" -> "^arn:aws:iam::123456789012:.*$"
          // considers exact matches + wildcard matches
          const regex = new RegExp(`^${principalArn.replace(/\*/g, ".*")}$`);
          return regex.test(extractPrincipalArn(Arn));
        });

      if (!isArnAllowed) throw new UnauthorizedError();
    }

    const identityAccessToken = await identityAwsIamAuthDAL.transaction(async (tx) => {
      const newToken = await identityAccessTokenDAL.create(
        {
          identityId: identityAwsIamAuth.identityId,
          isAccessTokenRevoked: false,
          accessTokenTTL: identityAwsIamAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAwsIamAuth.accessTokenMaxTTL,
          accessTokenNumUses: 0,
          accessTokenNumUsesLimit: identityAwsIamAuth.accessTokenNumUsesLimit
        },
        tx
      );
      return newToken;
    });

    const appCfg = getConfig();
    const accessToken = jwt.sign(
      {
        identityId: identityAwsIamAuth.identityId,
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

    return { accessToken, identityAwsIamAuth, identityAccessToken, identityMembershipOrg };
  };

  const attachAwsIamAuth = async ({
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
  }: TAttachAWSIAMAuthDTO) => {
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

    const identityAwsIamAuth = await identityAwsIamAuthDAL.transaction(async (tx) => {
      const doc = await identityAwsIamAuthDAL.create(
        {
          identityId: identityMembershipOrg.identityId,
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
          authMethod: IdentityAuthMethod.AWS_IAM_AUTH
        },
        tx
      );
      return doc;
    });
    return { ...identityAwsIamAuth, orgId: identityMembershipOrg.orgId };
  };

  const updateAwsIamAuth = async ({
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
  }: TUpdateAWSIAMAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AWS_IAM_AUTH)
      throw new BadRequestError({
        message: "Failed to update AWS IAM Auth"
      });

    const identityAwsIamAuth = await identityAwsIamAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityAwsIamAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityAwsIamAuth.accessTokenMaxTTL) >
        (accessTokenMaxTTL || identityAwsIamAuth.accessTokenMaxTTL)
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

    const updatedAwsIamAuth = await identityAwsIamAuthDAL.updateById(identityAwsIamAuth.id, {
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

    return { ...updatedAwsIamAuth, orgId: identityMembershipOrg.orgId };
  };

  const getAwsIamAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAWSIAMAuthDTO) => {
    const identityMembershipOrg = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityMembershipOrg) throw new BadRequestError({ message: "Failed to find identity" });
    if (identityMembershipOrg.identity?.authMethod !== IdentityAuthMethod.AWS_IAM_AUTH)
      throw new BadRequestError({
        message: "The identity does not have AWS IAM Auth attached"
      });

    const awsIamIdentityAuth = await identityAwsIamAuthDAL.findOne({ identityId });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityMembershipOrg.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
    return { ...awsIamIdentityAuth, orgId: identityMembershipOrg.orgId };
  };

  return {
    login,
    attachAwsIamAuth,
    updateAwsIamAuth,
    getAwsIamAuth
  };
};
