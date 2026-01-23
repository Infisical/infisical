/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { ForbiddenError, subject } from "@casl/ability";
import { requestContext } from "@fastify/request-context";
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import axios from "axios";
import RE2 from "re2";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas/models";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";

import { ActorType, AuthTokenType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenJwtPayload } from "../identity-access-token/identity-access-token-types";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityAwsAuthDALFactory } from "./identity-aws-auth-dal";
import { extractPrincipalArn, extractPrincipalArnEntity } from "./identity-aws-auth-fns";
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
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete">;
  identityAwsAuthDAL: Pick<TIdentityAwsAuthDALFactory, "findOne" | "transaction" | "create" | "updateById" | "delete">;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne">;
};

export type TIdentityAwsAuthServiceFactory = ReturnType<typeof identityAwsAuthServiceFactory>;

const awsRegionFromHeader = (authorizationHeader: string): string | null => {
  // https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-auth-using-authorization-header.html
  // The Authorization header takes the following form.
  //  Authorization: AWS4-HMAC-SHA256
  //	Credential=AKIAIOSFODNN7EXAMPLE/20230719/us-east-1/sts/aws4_request,
  // 	SignedHeaders=content-length;content-type;host;x-amz-date,
  //	Signature=fe5f80f77d5fa3beca038a248ff027d0445342fe2855ddc963176630326f1024
  //
  // The credential is in the form of "<your-access-key-id>/<date>/<aws-region>/<aws-service>/aws4_request"
  try {
    const fields = authorizationHeader.split(" ");
    for (const field of fields) {
      if (field.startsWith("Credential=")) {
        const parts = field.split("/");
        if (parts.length >= 3) {
          return parts[2];
        }
      }
    }
  } catch {
    return null;
  }
  return null;
};

function isValidAwsRegion(region: string | null): boolean {
  const validRegionPattern = new RE2("^[a-z0-9-]+$");
  if (typeof region !== "string" || region.length === 0 || region.length > 20) {
    return false;
  }

  return validRegionPattern.test(region);
}

export const identityAwsAuthServiceFactory = ({
  identityDAL,
  identityAccessTokenDAL,
  identityAwsAuthDAL,
  membershipIdentityDAL,
  licenseService,
  permissionService,
  orgDAL
}: TIdentityAwsAuthServiceFactoryDep) => {
  const login = async ({
    identityId,
    iamHttpRequestMethod,
    iamRequestBody,
    iamRequestHeaders,
    subOrganizationName
  }: TLoginAwsAuthDTO) => {
    const appCfg = getConfig();
    const identityAwsAuth = await identityAwsAuthDAL.findOne({ identityId });
    if (!identityAwsAuth) {
      throw new NotFoundError({ message: "AWS auth method not found for identity, did you configure AWS auth?" });
    }

    const identity = await identityDAL.findById(identityAwsAuth.identityId);
    if (!identity) throw new UnauthorizedError({ message: "Identity not found" });

    const org = await orgDAL.findById(identity.orgId);
    const isSubOrgIdentity = Boolean(org.rootOrgId);

    // If the identity is a sub-org identity, then the scope is always the org.id, and if it's a root org identity, then we need to resolve the scope if a subOrganizationName is specified
    let subOrganizationId = isSubOrgIdentity ? org.id : null;

    try {
      const headers: TAwsGetCallerIdentityHeaders = JSON.parse(Buffer.from(iamRequestHeaders, "base64").toString());
      const body: string = Buffer.from(iamRequestBody, "base64").toString();

      const authHeader = headers.Authorization || headers.authorization;
      const region = authHeader ? awsRegionFromHeader(authHeader) : null;

      if (!isValidAwsRegion(region)) {
        throw new BadRequestError({ message: "Invalid AWS region" });
      }

      const url = region ? `https://sts.${region}.amazonaws.com` : identityAwsAuth.stsEndpoint;

      const {
        data: {
          GetCallerIdentityResponse: {
            GetCallerIdentityResult: { Account, Arn, UserId }
          }
        }
      }: { data: TGetCallerIdentityResponse } = await axios({
        method: iamHttpRequestMethod,
        url,
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

        const formattedArn = extractPrincipalArn(Arn);

        const isArnAllowed = identityAwsAuth.allowedPrincipalArns
          .split(",")
          .map((principalArn) => principalArn.trim())
          .some((principalArn) => {
            // convert wildcard ARN to a regular expression: "arn:aws:iam::123456789012:*" -> "^arn:aws:iam::123456789012:.*$"
            // considers exact matches + wildcard matches
            // heavily validated in router
            const regex = new RE2(`^${principalArn.replaceAll("*", ".*")}$`);
            return regex.test(formattedArn) || regex.test(extractPrincipalArn(Arn, true));
          });

        if (!isArnAllowed) {
          logger.error(
            `AWS Auth Login: AWS principal ARN not allowed [principal-arn=${formattedArn}] [raw-arn=${Arn}] [identity-id=${identity.id}]`
          );

          throw new UnauthorizedError({
            message: `Access denied: AWS principal ARN not allowed. [principal-arn=${formattedArn}]`
          });
        }
      }

      if (subOrganizationName) {
        if (!isSubOrgIdentity) {
          const subOrg = await orgDAL.findOne({ rootOrgId: org.id, slug: subOrganizationName });

          if (!subOrg) {
            throw new NotFoundError({ message: `Sub organization with name ${subOrganizationName} not found` });
          }

          const subOrgMembership = await membershipIdentityDAL.findOne({
            scope: AccessScope.Organization,
            actorIdentityId: identity.id,
            scopeOrgId: subOrg.id
          });

          if (!subOrgMembership) {
            throw new UnauthorizedError({
              message: `Identity not authorized to access sub organization ${subOrganizationName}`
            });
          }

          subOrganizationId = subOrg.id;
        }
      }

      const identityAccessToken = await identityAwsAuthDAL.transaction(async (tx) => {
        await membershipIdentityDAL.update(
          identity.projectId
            ? {
                scope: AccessScope.Project,
                scopeOrgId: identity.orgId,
                scopeProjectId: identity.projectId,
                actorIdentityId: identity.id
              }
            : {
                scope: AccessScope.Organization,
                scopeOrgId: identity.orgId,
                actorIdentityId: identity.id
              },
          {
            lastLoginAuthMethod: IdentityAuthMethod.AWS_AUTH,
            lastLoginTime: new Date()
          },
          tx
        );
        const newToken = await identityAccessTokenDAL.create(
          {
            identityId: identityAwsAuth.identityId,
            isAccessTokenRevoked: false,
            accessTokenTTL: identityAwsAuth.accessTokenTTL,
            accessTokenMaxTTL: identityAwsAuth.accessTokenMaxTTL,
            accessTokenNumUses: 0,
            accessTokenNumUsesLimit: identityAwsAuth.accessTokenNumUsesLimit,
            authMethod: IdentityAuthMethod.AWS_AUTH,
            subOrganizationId
          },
          tx
        );
        return newToken;
      });

      const splitArn = extractPrincipalArnEntity(Arn);
      const accessToken = crypto.jwt().sign(
        {
          identityId: identityAwsAuth.identityId,
          identityAccessTokenId: identityAccessToken.id,
          authTokenType: AuthTokenType.IDENTITY_ACCESS_TOKEN,
          identityAuth: {
            aws: {
              accountId: Account,
              arn: Arn,
              userId: UserId,

              // Derived from ARN
              partition: splitArn.Partition,
              service: splitArn.Service,
              resourceType: splitArn.Type,
              resourceName: splitArn.FriendlyName
            }
          }
        } as TIdentityAccessTokenJwtPayload,
        appCfg.AUTH_SECRET,
        // akhilmhdh: for non-expiry tokens you should not even set the value, including undefined. Even for undefined jsonwebtoken throws error
        Number(identityAccessToken.accessTokenTTL) === 0
          ? undefined
          : {
              expiresIn: Number(identityAccessToken.accessTokenTTL)
            }
      );

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityAwsAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.AWS_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.SUCCESS,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }

      return { accessToken, identityAwsAuth, identityAccessToken, identity };
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.identity.id": identityAwsAuth.identityId,
          "infisical.identity.name": identity.name,
          "infisical.organization.id": org.id,
          "infisical.organization.name": org.name,
          "infisical.identity.auth_method": AuthAttemptAuthMethod.AWS_AUTH,
          "infisical.identity.auth_result": AuthAttemptAuthResult.FAILURE,
          "client.address": requestContext.get("ip"),
          "user_agent.original": requestContext.get("userAgent")
        });
      }
      throw error;
    }
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
    actorOrgId,
    isActorSuperAdmin
  }: TAttachAwsAuthDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AWS_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add AWS Auth to already configured identity"
      });
    }

    if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Create,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId,
        scope: OrganizationActionScope.Any
      });
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
    }
    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
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
          identityId: identityMembershipOrg.identity.id,
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
      return doc;
    });
    return { ...identityAwsAuth, orgId: identityMembershipOrg.scopeOrgId };
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
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AWS_AUTH)) {
      throw new NotFoundError({
        message: "The identity does not have AWS Auth attached"
      });
    }

    const identityAwsAuth = await identityAwsAuthDAL.findOne({ identityId });

    if (
      (accessTokenMaxTTL || identityAwsAuth.accessTokenMaxTTL) > 0 &&
      (accessTokenTTL || identityAwsAuth.accessTokenMaxTTL) > (accessTokenMaxTTL || identityAwsAuth.accessTokenMaxTTL)
    ) {
      throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
    }

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Edit,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);
    }
    const plan = await licenseService.getPlan(identityMembershipOrg.scopeOrgId);
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

    return { ...updatedAwsAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getAwsAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAwsAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AWS_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have AWS Auth attached"
      });
    }

    const awsIdentityAuth = await identityAwsAuthDAL.findOne({ identityId });

    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.Read,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    }
    return { ...awsIdentityAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityAwsAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAwsAuthDTO) => {
    const identityMembershipOrg = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId
    });
    if (!identityMembershipOrg) throw new NotFoundError({ message: `Failed to find identity with ID ${identityId}` });
    if (identityMembershipOrg.identity.orgId !== actorOrgId) {
      throw new ForbiddenRequestError({ message: "Sub organization not authorized to access this identity" });
    }
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AWS_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have aws auth"
      });
    }
    if (identityMembershipOrg.identity.projectId) {
      const { permission } = await permissionService.getProjectPermission({
        actionProjectType: ActionProjectType.Any,
        actor,
        actorId,
        projectId: identityMembershipOrg.identity.projectId,
        actorAuthMethod,
        actorOrgId
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionIdentityActions.RevokeAuth,
        subject(ProjectPermissionSub.Identity, { identityId })
      );
    } else {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      const { permission: rolePermission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.Any,
        actor: ActorType.IDENTITY,
        actorId: identityMembershipOrg.identity.id,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
      });

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(identityMembershipOrg.scopeOrgId);
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
            "Failed to revoke aws auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }
    const revokedIdentityAwsAuth = await identityAwsAuthDAL.transaction(async (tx) => {
      const deletedAwsAuth = await identityAwsAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.AWS_AUTH }, tx);

      return { ...deletedAwsAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
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
