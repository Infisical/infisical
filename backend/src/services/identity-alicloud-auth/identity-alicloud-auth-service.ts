/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenError, subject } from "@casl/ability";
import { AxiosError } from "axios";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { request } from "@app/lib/config/request";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { logger } from "@app/lib/logger";
import { AuthAttemptAuthMethod } from "@app/lib/telemetry/metrics";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { runIdentityLogin, TIdentityAuthLoginStrategy } from "../identity-auth/identity-auth-pipeline";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
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
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete" | "transaction">;
  identityAliCloudAuthDAL: Pick<
    TIdentityAliCloudAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
};

export type TIdentityAliCloudAuthServiceFactory = ReturnType<typeof identityAliCloudAuthServiceFactory>;

export const identityAliCloudAuthServiceFactory = ({
  identityDAL,
  identityAccessTokenDAL,
  identityAliCloudAuthDAL,
  membershipIdentityDAL,
  licenseService,
  permissionService,
  orgDAL
}: TIdentityAliCloudAuthServiceFactoryDep) => {
  const login = async ({ identityId, organizationSlug, ...alicloudParams }: TLoginAliCloudAuthDTO) => {
    let capturedIdentityAliCloudAuth: Awaited<ReturnType<typeof identityAliCloudAuthDAL.findOne>> | undefined;

    const strategy: TIdentityAuthLoginStrategy<typeof alicloudParams> = {
      authMethod: IdentityAuthMethod.ALICLOUD_AUTH,
      telemetryAuthMethod: AuthAttemptAuthMethod.ALICLOUD_AUTH,
      validate: async (payload, ctx) => {
        const identityAliCloudAuth = await identityAliCloudAuthDAL.findOne({ identityId: ctx.identity.id });
        if (!identityAliCloudAuth)
          throw new NotFoundError({
            message: "AliCloud auth method not found for identity, did you configure AliCloud auth?"
          });
        capturedIdentityAliCloudAuth = identityAliCloudAuth;

        const requestUrl = new URL("https://sts.aliyuncs.com");

        for (const key of Object.keys(payload)) {
          requestUrl.searchParams.set(key, (payload as Record<string, string>)[key]);
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
              message: "Access denied: Alibaba Cloud account ARN not allowed.",
              detail: {
                reasonCode: "arn_not_allowed",
                identityId: ctx.identity.id,
                orgId: ctx.identity.orgId,
                identityName: ctx.identity.name
              }
            });
        }

        return {
          accessTokenTTL: identityAliCloudAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAliCloudAuth.accessTokenMaxTTL,
          accessTokenNumUsesLimit: identityAliCloudAuth.accessTokenNumUsesLimit
        };
      }
    };

    const result = await runIdentityLogin({ identityId, organizationSlug, payload: alicloudParams }, strategy, {
      identityDAL,
      orgDAL,
      identityAccessTokenDAL,
      membershipIdentityDAL
    });

    return { ...result, identityAliCloudAuth: capturedIdentityAliCloudAuth! };
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

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Alibaba Cloud Auth to already configured identity"
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
        scope: OrganizationActionScope.Any,
        actor,
        actorId,
        orgId: identityMembershipOrg.scopeOrgId,
        actorAuthMethod,
        actorOrgId
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

    const identityAliCloudAuth = await identityAliCloudAuthDAL.transaction(async (tx) => {
      const doc = await identityAliCloudAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
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
    return { ...identityAliCloudAuth, orgId: identityMembershipOrg.scopeOrgId };
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

    const updatedAliCloudAuth = await identityAliCloudAuthDAL.updateById(identityAliCloudAuth.id, {
      allowedArns,
      accessTokenMaxTTL,
      accessTokenTTL,
      accessTokenNumUsesLimit,
      accessTokenTrustedIps: reformattedAccessTokenTrustedIps
        ? JSON.stringify(reformattedAccessTokenTrustedIps)
        : undefined
    });

    return { ...updatedAliCloudAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const getAliCloudAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAliCloudAuthDTO) => {
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

    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Alibaba Cloud Auth attached"
      });
    }

    const alicloudIdentityAuth = await identityAliCloudAuthDAL.findOne({ identityId });

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
    return { ...alicloudIdentityAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityAliCloudAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAliCloudAuthDTO) => {
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
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.ALICLOUD_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Alibaba Cloud auth"
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
            "Failed to revoke Alibaba Cloud auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityAliCloudAuth = await identityAliCloudAuthDAL.transaction(async (tx) => {
      const deletedAliCloudAuth = await identityAliCloudAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.ALICLOUD_AUTH }, tx);

      return { ...deletedAliCloudAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
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
