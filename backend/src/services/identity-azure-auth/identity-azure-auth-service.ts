import { ForbiddenError, subject } from "@casl/ability";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import {
  BadRequestError,
  ForbiddenRequestError,
  NotFoundError,
  PermissionBoundaryError,
  UnauthorizedError
} from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr } from "@app/lib/ip";
import { AuthAttemptAuthMethod } from "@app/lib/telemetry/metrics";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";
import { runIdentityLogin, TIdentityAuthLoginStrategy } from "../identity-auth/identity-auth-pipeline";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
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
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityAzureAuthDAL: Pick<
    TIdentityAzureAuthDALFactory,
    "findOne" | "transaction" | "create" | "updateById" | "delete"
  >;
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "findOne" | "update" | "getIdentityById">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "create" | "delete" | "transaction">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findOne" | "findEffectiveOrgMembership">;
};

export type TIdentityAzureAuthServiceFactory = ReturnType<typeof identityAzureAuthServiceFactory>;

export const identityAzureAuthServiceFactory = ({
  identityDAL,
  identityAzureAuthDAL,
  membershipIdentityDAL,
  identityAccessTokenDAL,
  permissionService,
  licenseService,
  orgDAL
}: TIdentityAzureAuthServiceFactoryDep) => {
  const login = async ({ identityId, jwt: jwtValue, organizationSlug }: TLoginAzureAuthDTO) => {
    type TLoginAuthConfig = NonNullable<Awaited<ReturnType<typeof identityAzureAuthDAL.findOne>>>;
    const strategy: TIdentityAuthLoginStrategy<{ jwt: string }, TLoginAuthConfig> = {
      authMethod: IdentityAuthMethod.AZURE_AUTH,
      telemetryAuthMethod: AuthAttemptAuthMethod.AZURE_AUTH,
      validate: async (payload, ctx) => {
        const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId: ctx.identity.id });
        if (!identityAzureAuth)
          throw new NotFoundError({
            message: "Azure auth method not found for identity, did you configure Azure auth?"
          });
        const azureIdentity = await validateAzureIdentity({
          tenantId: identityAzureAuth.tenantId,
          resource: identityAzureAuth.resource,
          jwt: payload.jwt
        });

        if (azureIdentity.tid !== identityAzureAuth.tenantId)
          throw new UnauthorizedError({
            message: "Tenant ID mismatch",
            detail: {
              reasonCode: "tenant_id_mismatch",
              identityId: ctx.identity.id,
              orgId: ctx.identity.orgId,
              identityName: ctx.identity.name
            }
          });

        if (identityAzureAuth.allowedServicePrincipalIds) {
          // validate if the service principal id is in the list of allowed service principal ids
          const isServicePrincipalAllowed = identityAzureAuth.allowedServicePrincipalIds
            .split(",")
            .map((servicePrincipalId) => servicePrincipalId.trim())
            .some((servicePrincipalId) => servicePrincipalId === azureIdentity.oid);

          if (!isServicePrincipalAllowed) {
            throw new UnauthorizedError({
              message: `Service principal '${azureIdentity.oid}' not allowed`,
              detail: {
                reasonCode: "service_principal_not_allowed",
                identityId: ctx.identity.id,
                orgId: ctx.identity.orgId,
                identityName: ctx.identity.name
              }
            });
          }
        }

        return {
          accessTokenTTL: identityAzureAuth.accessTokenTTL,
          accessTokenMaxTTL: identityAzureAuth.accessTokenMaxTTL,
          accessTokenNumUsesLimit: identityAzureAuth.accessTokenNumUsesLimit,
          authConfig: identityAzureAuth
        };
      }
    };

    const { authConfig: identityAzureAuth, ...result } = await runIdentityLogin(
      { identityId, organizationSlug, payload: { jwt: jwtValue } },
      strategy,
      { identityDAL, orgDAL, identityAccessTokenDAL, membershipIdentityDAL }
    );

    return { ...result, identityAzureAuth };
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

    if (identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "Failed to add Azure Auth to already configured identity"
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

    const identityAzureAuth = await identityAzureAuthDAL.transaction(async (tx) => {
      const doc = await identityAzureAuthDAL.create(
        {
          identityId: identityMembershipOrg.identity.id,
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
    return { ...identityAzureAuth, orgId: identityMembershipOrg.scopeOrgId };
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
      orgId: identityMembershipOrg.scopeOrgId
    };
  };

  const getAzureAuth = async ({ identityId, actorId, actor, actorAuthMethod, actorOrgId }: TGetAzureAuthDTO) => {
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
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have Azure Auth attached"
      });
    }

    const identityAzureAuth = await identityAzureAuthDAL.findOne({ identityId });

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
    return { ...identityAzureAuth, orgId: identityMembershipOrg.scopeOrgId };
  };

  const revokeIdentityAzureAuth = async ({
    identityId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TRevokeAzureAuthDTO) => {
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
    if (!identityMembershipOrg.identity.authMethods.includes(IdentityAuthMethod.AZURE_AUTH)) {
      throw new BadRequestError({
        message: "The identity does not have azure auth"
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
            "Failed to revoke azure auth of identity with more privileged role",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.RevokeAuth,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const revokedIdentityAzureAuth = await identityAzureAuthDAL.transaction(async (tx) => {
      const deletedAzureAuth = await identityAzureAuthDAL.delete({ identityId }, tx);
      await identityAccessTokenDAL.delete({ identityId, authMethod: IdentityAuthMethod.AZURE_AUTH }, tx);

      return { ...deletedAzureAuth?.[0], orgId: identityMembershipOrg.scopeOrgId };
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
