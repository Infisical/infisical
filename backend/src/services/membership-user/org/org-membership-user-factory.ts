import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope, OrgMembershipStatus } from "@app/db/schemas";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { assertPermissionBoundary } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, ForbiddenRequestError, InternalServerError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { matchesAllowedEmailDomain } from "@app/lib/validator";
import { ActorType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { isCustomOrgRole } from "@app/services/org/org-role-fns";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { LoginMethod } from "@app/services/super-admin/super-admin-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TMembershipUserDALFactory } from "../membership-user-dal";
import { TMembershipUserScopeFactory } from "../membership-user-types";

type TOrgMembershipUserScopeFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRoles">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  userDAL: Pick<TUserDALFactory, "findById">;
  smtpService: Pick<TSmtpService, "sendMail">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "delete">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "find">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "find">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne">;
};

export const newOrgMembershipUserFactory = ({
  permissionService,
  tokenService,
  userDAL,
  orgDAL,
  smtpService,
  licenseService,
  membershipUserDAL,
  emailDomainDAL,
  oidcConfigDAL,
  samlConfigDAL
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

  const $getEnforcedSsoLoginUrl = async (orgId: string, orgSlug: string) => {
    const appCfg = getConfig();

    const [oidcConfig, samlConfig] = await Promise.all([
      oidcConfigDAL.findOne({ orgId, isActive: true }).catch(() => null),
      samlConfigDAL.findOne({ orgId, isActive: true }).catch(() => null)
    ]);

    if (oidcConfig) {
      return `${appCfg.SITE_URL}/api/v1/sso/oidc/login?orgSlug=${encodeURIComponent(orgSlug)}`;
    }
    if (samlConfig) {
      return `${appCfg.SITE_URL}/api/v1/sso/redirect/saml2/organizations/${encodeURIComponent(orgSlug)}`;
    }
    // LDAP is credential-based with no SSO redirect endpoint (and a safe fallback for any other
    // enforced method) — send invitees to the login page to sign in with their org credentials.
    return `${appCfg.SITE_URL}/login`;
  };

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

    if (dto.data.roles.length) {
      const permissionRoles = await permissionService.getOrgPermissionByRoles(
        dto.data.roles.map((el) => el.role),
        dto.permission.orgId
      );
      for (const permissionRole of permissionRoles) {
        assertPermissionBoundary(
          permission,
          permissionRole.permission,
          "Cannot grant a role exceeding your own privileges to a new org member"
        );
      }
    }

    const plan = await licenseService.getPlan(dto.permission.orgId);
    const isEnterpriseBypass = plan?.slug === "enterprise" && !plan?.enforceIdentityLimit;
    if (!isEnterpriseBypass && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        name: "InviteUser",
        message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
      });
    }

    const org = await requestMemoize(requestMemoKeys.orgFindById(dto.permission.orgId), () =>
      orgDAL.findById(dto.permission.orgId)
    );
    if (org?.authEnforced) {
      const invitedEmails = newMembers.map((el) => el.email).filter((email): email is string => Boolean(email));

      // The invited address must belong to a verified org domain — anything else could never
      // complete the enforced SSO login, leaving a dead invitation.
      const verifiedDomains = await emailDomainDAL.find({
        orgId: org.id,
        status: EmailDomainStatus.Verified
      });
      const verifiedDomainSet = new Set(verifiedDomains.map((el) => el.domain.toLowerCase().trim()));

      const unverifiedEmails = invitedEmails.filter((email) => {
        const emailDomain = email.split("@")?.[1]?.toLowerCase().trim();
        return !emailDomain || !verifiedDomainSet.has(emailDomain);
      });

      if (unverifiedEmails.length) {
        throw new ForbiddenRequestError({
          name: "InviteUser",
          message: `Failed to invite user(s) ${unverifiedEmails.join(
            ", "
          )} due to org-level auth being enforced. Only users with a verified organization email domain can be invited.`
        });
      }

      const oidcConfig = await oidcConfigDAL.findOne({ orgId: org.id, isActive: true }).catch(() => null);
      const oidcAllowedDomains = oidcConfig?.allowedEmailDomains?.trim();
      if (oidcAllowedDomains) {
        const disallowedEmails = invitedEmails.filter((email) => !matchesAllowedEmailDomain(email, oidcAllowedDomains));

        if (disallowedEmails.length) {
          throw new ForbiddenRequestError({
            name: "InviteUser",
            message: `Failed to invite user(s) ${disallowedEmails.join(
              ", "
            )} due to the organization's OIDC allowed email domain restrictions.`
          });
        }
      }
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
        ? await requestMemoize(requestMemoKeys.userFindById(dto.permission.id), () =>
            userDAL.findById(dto.permission.id)
          )
        : {
            firstName: "Platform Identity",
            email: "identity"
          };

    const signUpTokens: { email: string; link: string }[] = [];
    const orgDetails = await requestMemoize(requestMemoKeys.orgFindById(dto.permission.orgId), () =>
      orgDAL.findById(dto.permission.orgId)
    );
    const serverCfg = await getServerCfg();
    const isEmailLoginEnabled =
      !serverCfg.enabledLoginMethods || serverCfg.enabledLoginMethods.includes(LoginMethod.EMAIL);

    if (orgDetails.rootOrgId) {
      // checking if the users have accepted the invitation in the root organization to send the email
      const orgMembershipAccepted = await membershipUserDAL.find({
        scope: AccessScope.Organization,
        scopeOrgId: orgDetails.rootOrgId,
        status: OrgMembershipStatus.Accepted,
        $in: {
          actorUserId: newUsers.map((el) => el.id)
        }
      });

      const orgMembershipAcceptedUserIds = orgMembershipAccepted.map((el) => el.actorUserId as string);

      const emails = newUsers
        .filter((el) => Boolean(el?.email) && orgMembershipAcceptedUserIds.includes(el.id))
        .map((el) => el?.email as string);

      if (emails.length) {
        await smtpService.sendMail({
          template: SmtpTemplates.SubOrgInvite,
          subjectLine: "Infisical sub-organization invitation",
          recipients: emails,
          substitutions: {
            subOrganizationName: orgDetails.slug,
            callback_url: `${appCfg.SITE_URL}/organizations/${dto.permission.orgId}/projects`
          }
        });
      }
    } else if (orgDetails.authEnforced) {
      const ssoLoginUrl = await $getEnforcedSsoLoginUrl(orgDetails.id, orgDetails.slug);

      const emails = newUsers.map((el) => el.email).filter((email): email is string => Boolean(email));

      if (!appCfg.isSmtpConfigured) {
        emails.forEach((email) => {
          signUpTokens.push({
            email,
            link: ssoLoginUrl
          });
        });
      }

      await Promise.allSettled(
        emails.map((email) =>
          smtpService.sendMail({
            template: SmtpTemplates.OrgInvite,
            subjectLine: "Infisical organization invitation",
            recipients: [email],
            substitutions: {
              inviterFirstName: actorDetails?.firstName,
              inviterUsername: actorDetails?.email,
              organizationName: orgDetails?.name,
              callback_url: ssoLoginUrl
            }
          })
        )
      );
    } else if (isEmailLoginEnabled) {
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
                callback_url: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${encodeURIComponent(
                  el.email
                )}&organization_id=${dto.permission.orgId}`
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

    if (dto.data.roles.length) {
      const permissionRoles = await permissionService.getOrgPermissionByRoles(
        dto.data.roles.map((el) => el.role),
        dto.permission.orgId
      );
      for (const permissionRole of permissionRoles) {
        assertPermissionBoundary(
          permission,
          permissionRole.permission,
          "Cannot grant a role exceeding your own privileges to an existing org member"
        );
      }
    }
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
