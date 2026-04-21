import { ForbiddenError, subject } from "@casl/ability";

import { AccessScope, ActionProjectType, IdentityAuthMethod, OrganizationActionScope } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionIdentityActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { extractIPDetails, isValidIpOrCidr, TIp } from "@app/lib/ip";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";

export type TManageDeps = {
  membershipIdentityDAL: Pick<TMembershipIdentityDALFactory, "getIdentityById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

type TLoadIdentityForManagementParams = {
  identityId: string;
  authMethod: IdentityAuthMethod;
  isActorSuperAdmin: boolean;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
  projectAction: ProjectPermissionIdentityActions;
  orgAction: OrgPermissionIdentityActions;
};

export const loadIdentityForManagement = async (
  {
    identityId,
    authMethod,
    isActorSuperAdmin,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    projectAction,
    orgAction
  }: TLoadIdentityForManagementParams,
  deps: TManageDeps
) => {
  await validateIdentityUpdateForSuperAdminPrivileges(identityId, isActorSuperAdmin);

  const identityMembershipOrg = await deps.membershipIdentityDAL.getIdentityById({
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

  if (identityMembershipOrg.identity.authMethods.includes(authMethod)) {
    throw new BadRequestError({
      message: `Failed to add ${authMethod} to already configured identity`
    });
  }

  if (identityMembershipOrg.identity.projectId) {
    const { permission } = await deps.permissionService.getProjectPermission({
      actionProjectType: ActionProjectType.Any,
      actor,
      actorId,
      projectId: identityMembershipOrg.identity.projectId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      projectAction,
      subject(ProjectPermissionSub.Identity, { identityId })
    );
  } else {
    const { permission } = await deps.permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: identityMembershipOrg.scopeOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });

    ForbiddenError.from(permission).throwUnlessCan(orgAction, OrgPermissionSubjects.Identity);
  }

  const plan = await deps.licenseService.getPlan(identityMembershipOrg.scopeOrgId);

  return { identityMembershipOrg, plan };
};

export const validateTokenTTL = (accessTokenTTL: number, accessTokenMaxTTL: number) => {
  if (accessTokenMaxTTL > 0 && accessTokenTTL > accessTokenMaxTTL) {
    throw new BadRequestError({ message: "Access token TTL cannot be greater than max TTL" });
  }
};

export const processIpAllowlist = (trustedIps: { ipAddress: string }[], plan: { ipAllowlisting: boolean }): TIp[] =>
  trustedIps.map((trustedIp) => {
    if (!plan.ipAllowlisting && trustedIp.ipAddress !== "0.0.0.0/0" && trustedIp.ipAddress !== "::/0")
      throw new BadRequestError({
        message:
          "Failed to add IP access range to access token due to plan restriction. Upgrade plan to add IP access range."
      });

    if (!isValidIpOrCidr(trustedIp.ipAddress))
      throw new BadRequestError({ message: "The IP is not a valid IPv4, IPv6, or CIDR block" });

    return extractIPDetails(trustedIp.ipAddress) as TIp;
  });
