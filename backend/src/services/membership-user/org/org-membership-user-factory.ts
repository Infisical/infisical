import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope } from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipUserDALFactory } from "../membership-user-dal";
import { TMembershipUserScopeFactory } from "../membership-user-types";

type TOrgMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  userDAL: Pick<TUserDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
};

export const newOrgMembershipUserFactory = ({
  permissionService,
  tokenService,
  userDAL,
  orgDAL,
  smtpService,
  licenseService,
  membershipUserDAL
}: TOrgMembershipUserScopeFactoryDep): TMembershipUserScopeFactory => {
  const getScopeField: TMembershipUserScopeFactory["getScopeField"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { key: "orgId" as const, value: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const getScopeDatabaseFields: TMembershipUserScopeFactory["getScopeDatabaseFields"] = (dto) => {
    if (dto.scope === AccessScope.Organization) {
      return { scopeOrgId: dto.orgId };
    }
    throw new InternalServerError({ message: "Invalid scope provided for the org factory" });
  };

  const isCustomRole: TMembershipUserScopeFactory["isCustomRole"] = (role: string) => isCustomOrgRole(role);

  const onCreateMembershipUserGuard: TMembershipUserScopeFactory["onCreateMembershipUserGuard"] = async (
    dto,
    newMembers
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        name: "InviteUser",
        message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }

    const org = await orgDAL.findById(dto.permission.orgId);
    if (org?.authEnforced) {
      throw new ForbiddenRequestError({
        name: "InviteUser",
        message: "Failed to invite user due to org-level auth enforced for organization"
      });
    }

    if (org.rootOrgId) {
      const rootOrgMembership = await membershipUserDAL.find({
        scope: AccessScope.Organization,
        $in: {
          actorUserId: newMembers.map((el) => el.id)
        },
        scopeOrgId: org.rootOrgId
      });
      if (rootOrgMembership.length !== newMembers.length) {
        const emails = newMembers
          .filter((user) => !rootOrgMembership.find((i) => i.actorUserId === user.id))
          .map((el) => el.email)
          .join(",");
        throw new BadRequestError({
          message: `Users with email ${emails}  doesn't have membership in root organization`
        });
      }
    }
  };

  const onCreateMembershipComplete: TMembershipUserScopeFactory["onCreateMembershipComplete"] = async (
    dto,
    newUsers
  ) => {
    const appCfg = getConfig();

    const actorDetails =
      dto.permission.type === ActorType.USER
        ? await userDAL.findById(dto.permission.id)
        : {
            firstName: "Platform Identity",
            email: "identity"
          };

    const signUpTokens: { email: string; link: string }[] = [];
    const orgDetails = await orgDAL.findById(dto.permission.orgId);
    if (orgDetails.rootOrgId) {
      const emails = newUsers.map((el) => el.email).filter(Boolean);
      await smtpService.sendMail({
        template: SmtpTemplates.SubOrgInvite,
        subjectLine: "Infisical sub-organization invitation",
        recipients: emails as string[],
        substitutions: {
          subOrganizationName: orgDetails.slug,
          callback_url: `${appCfg.SITE_URL}/organizations/${dto.permission.orgId}/projects?subOrganization=${orgDetails.slug}`
        }
      });
    } else {
      await Promise.allSettled(
        newUsers.map(async (el) => {
          const token = await tokenService.createTokenForUser({
            type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
            userId: el.id,
            orgId: dto.permission.orgId
          });

          if (el.email) {
            if (!appCfg.isSmtpConfigured) {
              signUpTokens.push({
                email: el.email,
                link: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${el.email}&organization_id=${dto.permission.orgId}`
              });
            }

            await smtpService.sendMail({
              template: SmtpTemplates.OrgInvite,
              subjectLine: "Infisical organization invitation",
              recipients: [el.email],
              substitutions: {
                inviterFirstName: actorDetails?.firstName,
                inviterUsername: actorDetails?.email,
                organizationName: orgDetails?.name,
                email: el.email,
                organizationId: orgDetails?.id.toString(),
                token,
                callback_url: `${appCfg.SITE_URL}/signupinvite`
              }
            });
          }
        })
      );
    }

    return { signUpTokens };
  };

  const onUpdateMembershipUserGuard: TMembershipUserScopeFactory["onUpdateMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);
  };

  const onDeleteMembershipUserGuard: TMembershipUserScopeFactory["onDeleteMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);
  };

  const onListMembershipUserGuard: TMembershipUserScopeFactory["onListMembershipUserGuard"] = async (dto) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  };

  const onGetMembershipUserByUserIdGuard: TMembershipUserScopeFactory["onGetMembershipUserByUserIdGuard"] = async (
    dto
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: dto.permission.type,
      actorId: dto.permission.id,
      orgId: dto.permission.orgId,
      actorAuthMethod: dto.permission.authMethod,
      actorOrgId: dto.permission.orgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);
  };

  return {
    onCreateMembershipUserGuard,
    onCreateMembershipComplete,
    onUpdateMembershipUserGuard,
    onDeleteMembershipUserGuard,
    onListMembershipUserGuard,
    onGetMembershipUserByUserIdGuard,
    getScopeField,
    getScopeDatabaseFields,
    isCustomRole
  };
};
