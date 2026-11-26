import { AccessScope, IdentityAuthMethod, OrgMembershipRole, OrgMembershipStatus, TUsers } from "@app/db/schemas";
import { sealKnexTransaction } from "@app/domains/lib/transactions";
import {
  LoginMethod,
  ReadFrom,
  TInstanceConfigPatch,
  TInstanceConfigService
} from "@app/domains/platform/instance-config-core/ce/module";
import { RootKeyEncryptionStrategy, TKmsRootKeyService } from "@app/domains/platform/kms-core/ce/module";
import {
  InstanceFeature,
  Meter,
  PlanFeature,
  PlanLimit,
  TLicenseService,
  TUsageMeteringService
} from "@app/domains/platform/license/ce/module";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { EmailDomainStatus } from "@app/ee/services/email-domain/email-domain-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { terminatePamSessionsForUsers } from "@app/ee/services/pam-session/pam-session-access-fns";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TIp } from "@app/lib/ip";
import { TEventEmitter } from "@app/lib/knex/event-emitter";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { OrgServiceActor } from "@app/lib/types";
import { isDisposableEmail, sanitizeEmail, validateEmail } from "@app/lib/validator";
import { assertPasswordNotBreached } from "@app/lib/validator/breached-password";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";

import { TAlertChannelRecipientDALFactory } from "../alert/alert-channel-recipient-dal";
import { AlertPrincipalType } from "../alert/alert-types";
import { TAuthLoginFactory } from "../auth/auth-login-service";
import { ActorType, AuthMethod } from "../auth/auth-type";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TIdentityTokenAuthDALFactory } from "../identity-token-auth/identity-token-auth-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TProjectAccessRevokeServiceFactory } from "../membership/project-access-revoke-service";
import { TMicrosoftTeamsServiceFactory } from "../microsoft-teams/microsoft-teams-service";
import { TOrgDALFactory } from "../org/org-dal";
import { deleteOrgMembershipsFn } from "../org/org-fns";
import { TOrgServiceFactory } from "../org/org-service";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { TUserDALFactory } from "../user/user-dal";
import { TInvalidateCacheQueueFactory } from "./invalidate-cache-queue";
import { assertInstanceSetupToken } from "./super-admin-fns";
import {
  CacheType,
  SuperAdminErrorCode,
  TAdminBootstrapInstanceDTO,
  TAdminCreateEmailDomainDTO,
  TAdminDeleteEmailDomainDTO,
  TAdminGetEmailDomainsDTO,
  TAdminGetIdentitiesDTO,
  TAdminGetUsersDTO,
  TAdminSignUpDTO,
  TCreateOrganizationDTO,
  TGetOrganizationsDTO,
  TResendOrgInviteDTO
} from "./super-admin-types";

type TSuperAdminServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityTokenAuthDAL: TIdentityTokenAuthDALFactory;
  identityAccessTokenService: Pick<TIdentityAccessTokenServiceFactory, "issueIdentityAccessToken">;
  orgDAL: TOrgDALFactory;
  instanceConfigService: TInstanceConfigService;
  userDAL: TUserDALFactory;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  alertChannelRecipientDAL: Pick<TAlertChannelRecipientDALFactory, "pruneOutOfScopeRecipients" | "deleteByPrincipals">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "findLiveByOrgAndUserIds" | "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "delete">;
  userGroupMembershipDAL: Pick<TUserGroupMembershipDALFactory, "deleteByUserIdsInGroupsOwnedByOrgs">;
  projectAccessRevokeService: Pick<TProjectAccessRevokeServiceFactory, "revokeActorsInOrgs">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  eventEmitter: TEventEmitter;
  emailDomainDAL: TEmailDomainDALFactory;
  authService: Pick<TAuthLoginFactory, "generateUserTokens">;
  kmsRootKeyService: TKmsRootKeyService;
  orgService: Pick<TOrgServiceFactory, "createOrganization">;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem" | "deleteItems">;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "initializeTeamsBot">;
  invalidateCacheQueue: TInvalidateCacheQueueFactory;
  smtpService: Pick<TSmtpService, "sendMail">;
  tokenService: TAuthTokenServiceFactory;
};

export type TSuperAdminServiceFactory = ReturnType<typeof superAdminServiceFactory>;

export const superAdminServiceFactory = ({
  instanceConfigService,
  userDAL,
  identityDAL,
  orgDAL,
  userAliasDAL,
  emailDomainDAL,
  authService,
  orgService,
  keyStore,
  kmsRootKeyService,
  licenseService,
  usageMeteringService,
  identityAccessTokenService,
  identityTokenAuthDAL,
  microsoftTeamsService,
  invalidateCacheQueue,
  smtpService,
  tokenService,
  membershipIdentityDAL,
  membershipUserDAL,
  membershipRoleDAL,
  alertChannelRecipientDAL,
  pamSessionDAL,
  gatewayV2Service,
  userGroupMembershipDAL,
  projectAccessRevokeService,
  auditLogService,
  eventEmitter
}: TSuperAdminServiceFactoryDep) => {
  const updateServerCfg = async (data: TInstanceConfigPatch, userId: string) => {
    // The lockout guard protects a user admin. A machine identity admin signs in with none of these
    // login methods, so there is nothing to lock it out of and no user row to read.
    const superAdminUser = data.enabledLoginMethods ? await userDAL.findById(userId) : undefined;
    if (data.enabledLoginMethods && superAdminUser) {
      const isSamlConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.SAML
        })
      );

      // We do not store SAML and OIDC auth values in the user authMethods field
      // and so we infer its usage from the user's aliases
      const isUserSamlAccessEnabled = isSamlConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.SAML);
      const isOidcConfiguredForUser = Boolean(
        await userAliasDAL.findOne({
          userId,
          aliasType: UserAliasType.OIDC
        })
      );

      const isUserOidcAccessEnabled = isOidcConfiguredForUser && data.enabledLoginMethods.includes(LoginMethod.OIDC);

      const loginMethodToAuthMethod = {
        [LoginMethod.EMAIL]: [AuthMethod.EMAIL],
        [LoginMethod.GOOGLE]: [AuthMethod.GOOGLE],
        [LoginMethod.GITLAB]: [AuthMethod.GITLAB],
        [LoginMethod.GITHUB]: [AuthMethod.GITHUB],
        [LoginMethod.LDAP]: [AuthMethod.LDAP],
        [LoginMethod.SAML]: [],
        [LoginMethod.OIDC]: []
      };

      const canServerAdminAccessAfterApply =
        data.enabledLoginMethods.some((loginMethod) =>
          loginMethodToAuthMethod[loginMethod].some((authMethod) => superAdminUser.authMethods?.includes(authMethod))
        ) ||
        isUserSamlAccessEnabled ||
        isUserOidcAccessEnabled;

      if (!canServerAdminAccessAfterApply) {
        throw new BadRequestError({
          name: SuperAdminErrorCode.AuthMethodLockout,
          message: "You must configure at least one auth method to prevent account lockout"
        });
      }
    }

    const config = await instanceConfigService.updateConfig(data);

    if (data.microsoftTeamsAppId || data.microsoftTeamsClientSecret || data.microsoftTeamsBotId) {
      const { credentials, configUpdatedAt } = await instanceConfigService.getMicrosoftTeamsCredentials({
        readFrom: ReadFrom.Primary
      });
      if (credentials.isComplete()) {
        await microsoftTeamsService.initializeTeamsBot({
          botAppId: credentials.appId,
          botAppPassword: credentials.clientSecret,
          lastUpdatedAt: configUpdatedAt
        });
      }
    }

    return config;
  };

  const adminSignUp = async ({
    lastName,
    firstName,
    email,
    password,
    organizationName,
    ip,
    userAgent,
    setupToken
  }: TAdminSignUpDTO) => {
    const appCfg = getConfig();
    assertInstanceSetupToken(setupToken);

    const sanitizedEmail = email.trim().toLowerCase();
    const existingUser = await userDAL.findOne({ username: sanitizedEmail });
    if (existingUser) throw new BadRequestError({ name: "Admin sign up", message: "User already exists" });

    await assertPasswordNotBreached(password);
    // The lookup can take seconds, so another admin signup may have finished meanwhile.
    const { initialized } = await instanceConfigService.getSettings();
    if (initialized) throw new BadRequestError({ message: "Admin account has already been set up" });

    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);

    const initialOrganizationName = organizationName ?? appCfg.INITIAL_ORGANIZATION_NAME ?? "Admin Org";

    // One transaction from the claim to completion: of two signups at once, the second waits on the claim and is
    // refused before it creates anything.
    const { userInfo, organization } = await userDAL.transaction(async (tx) => {
      const instanceConfig = instanceConfigService.within(sealKnexTransaction(tx));
      await instanceConfig.claimSetup();

      const newUser = await userDAL.create(
        {
          firstName,
          lastName,
          username: sanitizedEmail,
          email: sanitizedEmail,
          superAdmin: true,
          isGhost: false,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL],
          isEmailVerified: true,
          hashedPassword
        },
        tx
      );
      const newOrganization = await orgService.createOrganization(
        { userId: newUser.id, orgName: initialOrganizationName },
        tx
      );

      await instanceConfig.completeSetup({ closeSignUp: !appCfg.isCloud });
      return { userInfo: { user: { ...newUser, hashedPassword: null } }, organization: newOrganization };
    });

    await usageMeteringService.syncSeats(organization.id);
    usageMeteringService.emit(organization.id, Meter.PamIdentities);
    await instanceConfigService.refreshSharedCopy();

    const token = await authService.generateUserTokens({
      userId: userInfo.user.id,
      authMethod: AuthMethod.EMAIL,
      ip,
      userAgent,
      organizationId: undefined
    });
    // TODO(akhilmhdh-pg): telemetry service
    return { token, user: userInfo, organization };
  };

  const bootstrapInstance = async ({ email, password, organizationName, setupToken }: TAdminBootstrapInstanceDTO) => {
    const appCfg = getConfig();
    const sanitizedEmail = email.trim().toLowerCase();
    const { initialized } = await instanceConfigService.getSettings();
    if (initialized) {
      throw new BadRequestError({
        name: SuperAdminErrorCode.InstanceAlreadySetUp,
        message: "Instance has already been set up"
      });
    }

    assertInstanceSetupToken(setupToken);

    const existingUser = await userDAL.findOne({ email: sanitizedEmail });
    if (existingUser) throw new BadRequestError({ name: "Instance initialization", message: "User already exists" });

    const hashedPassword = await crypto.hashing().createHash(password, appCfg.SALT_ROUNDS);
    const initialOrganizationName = organizationName ?? "Admin Org";

    // One transaction from the claim to completion, as in adminSignUp.
    const { userInfo, organization, identity, credentials } = await userDAL.transaction(async (tx) => {
      const instanceConfig = instanceConfigService.within(sealKnexTransaction(tx));
      await instanceConfig.claimSetup();

      const newUser = await userDAL.create(
        {
          firstName: "Admin",
          lastName: "User",
          username: sanitizedEmail,
          email: sanitizedEmail,
          superAdmin: true,
          isGhost: false,
          isAccepted: true,
          authMethods: [AuthMethod.EMAIL],
          isEmailVerified: true,
          hashedPassword
        },
        tx
      );

      const userEnc = await userDAL.createUserEncryption(
        {
          userId: newUser.id,
          encryptionVersion: 2,
          hashedPassword
        },
        tx
      );

      const newOrganization = await orgService.createOrganization(
        { userId: newUser.id, orgName: initialOrganizationName },
        tx
      );

      const newIdentity = await identityDAL.create({ name: "Instance Admin Identity", orgId: newOrganization.id }, tx);
      const membership = await membershipIdentityDAL.create(
        {
          actorIdentityId: newIdentity.id,
          scopeOrgId: newOrganization.id,
          scope: AccessScope.Organization
        },
        tx
      );
      await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );

      const tokenAuth = await identityTokenAuthDAL.create(
        {
          identityId: newIdentity.id,
          accessTokenMaxTTL: 0,
          accessTokenTTL: 0,
          accessTokenNumUsesLimit: 0,
          accessTokenTrustedIps: JSON.stringify([
            {
              type: "ipv4",
              prefix: 0,
              ipAddress: "0.0.0.0"
            },
            {
              type: "ipv6",
              prefix: 0,
              ipAddress: "::"
            }
          ])
        },
        tx
      );

      // Issue through the standard path so the JWT carries an exp claim; a
      // hand-rolled no-exp token is rejected as over max age since the legacy
      // token cutoff (LEGACY_IDENTITY_ACCESS_TOKEN_EXPIRATION_ENFORCED_AT).
      const { accessToken } = await identityAccessTokenService.issueIdentityAccessToken({
        identityId: newIdentity.id,
        identityName: newIdentity.name,
        authMethod: IdentityAuthMethod.TOKEN_AUTH,
        orgId: newOrganization.id,
        rootOrgId: newOrganization.id,
        parentOrgId: newOrganization.id,
        subOrganizationId: newOrganization.id,
        accessTokenTTL: Number(tokenAuth.accessTokenTTL),
        accessTokenMaxTTL: Number(tokenAuth.accessTokenMaxTTL),
        accessTokenNumUsesLimit: Number(tokenAuth.accessTokenNumUsesLimit),
        accessTokenPeriod: 0,
        accessTokenTrustedIps: tokenAuth.accessTokenTrustedIps as TIp[],
        persistToPg: { tx, name: "Instance Admin Token" }
      });

      await instanceConfig.completeSetup({ closeSignUp: !appCfg.isCloud, adminIdentityId: newIdentity.id });

      return {
        userInfo: { user: { ...newUser, hashedPassword: null }, enc: userEnc },
        organization: newOrganization,
        identity: newIdentity,
        credentials: { token: accessToken }
      };
    });

    await usageMeteringService.syncSeats(organization.id);
    usageMeteringService.emit(organization.id, Meter.PamIdentities);
    await instanceConfigService.refreshSharedCopy();

    return {
      user: userInfo,
      organization,
      machineIdentity: {
        ...identity,
        credentials
      }
    };
  };

  const getUsers = ({ offset, limit, searchTerm, adminsOnly }: TAdminGetUsersDTO) => {
    return userDAL.getUsersByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "username",
      adminsOnly
    });
  };

  // Deleting a user cascades its org, project, and group memberships, so every identity meter changes
  // in each org the user belonged to. Memberships must be captured before the delete wipes them.
  const emitUserDeletionMeterEvents = (orgMemberships: { scopeOrgId?: string | null }[]) => {
    const orgIds = [...new Set(orgMemberships.map((m) => m.scopeOrgId).filter((id): id is string => Boolean(id)))];
    orgIds.forEach((orgId) => {
      usageMeteringService.emit(orgId, Meter.Identities);
      usageMeteringService.emit(orgId, Meter.UserIdentities);
      usageMeteringService.emit(orgId, Meter.SecretIdentities);
      usageMeteringService.emit(orgId, Meter.PamIdentities);
    });
  };

  const deleteUser = async (userId: string) => {
    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.length === 1 && superAdmins[0].id === userId) {
      throw new BadRequestError({
        message: "Cannot delete the only server admin on this instance. Add another server admin to delete this user."
      });
    }

    const orgMemberships = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      actorUserId: userId
    });

    let sendPamCancellations = () => {};

    const user = await userDAL.transaction(async (tx) => {
      sendPamCancellations = await terminatePamSessionsForUsers({
        orgIds: orgMemberships.map((m) => m.scopeOrgId),
        userIds: [userId],
        pamSessionDAL,
        gatewayV2Service,
        tx
      });

      const deletedUser = await userDAL.deleteById(userId, tx);
      // principalId carries no FK, so the user row going away leaves recipient rows behind.
      await alertChannelRecipientDAL.deleteByPrincipals(
        { principalType: AlertPrincipalType.USER, principalIds: [userId] },
        tx
      );
      return deletedUser;
    });

    sendPamCancellations();

    emitUserDeletionMeterEvents(orgMemberships);
    return user;
  };

  const deleteUsers = async (userIds: string[]) => {
    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.every((superAdmin) => userIds.includes(superAdmin.id))) {
      throw new BadRequestError({
        message: "Instance must have at least one server admin. Add another server admin to delete these users."
      });
    }

    const orgMemberships = await membershipUserDAL.find({
      scope: AccessScope.Organization,
      $in: { actorUserId: userIds }
    });

    let sendPamCancellations = () => {};

    const users = await userDAL.transaction(async (tx) => {
      sendPamCancellations = await terminatePamSessionsForUsers({
        orgIds: orgMemberships.map((m) => m.scopeOrgId),
        userIds,
        pamSessionDAL,
        gatewayV2Service,
        tx
      });

      const deletedUsers = await userDAL.delete(
        {
          $in: {
            id: userIds
          }
        },
        tx
      );
      await alertChannelRecipientDAL.deleteByPrincipals(
        { principalType: AlertPrincipalType.USER, principalIds: userIds },
        tx
      );
      return deletedUsers;
    });

    sendPamCancellations();

    emitUserDeletionMeterEvents(orgMemberships);
    return users;
  };

  const deleteIdentitySuperAdminAccess = async (identityId: string) => {
    const identity = await requestMemoize(requestMemoKeys.identityFindById(identityId), () =>
      identityDAL.findById(identityId)
    );
    if (!identity) {
      throw new NotFoundError({ name: "Identity", message: "Identity not found" });
    }

    await instanceConfigService.revokeAdminIdentity(identityId);

    return identity;
  };

  const deleteUserSuperAdminAccess = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) {
      throw new NotFoundError({ name: "User", message: "User not found" });
    }

    const superAdmins = await userDAL.find({
      superAdmin: true
    });

    if (superAdmins.length === 1 && superAdmins[0].id === userId) {
      throw new BadRequestError({
        message:
          "Cannot remove the only server admin on this instance. Add another server admin to remove status for this user."
      });
    }

    const updatedUser = userDAL.updateById(userId, { superAdmin: false });

    return updatedUser;
  };

  const getOrganizations = async ({ offset, limit, searchTerm }: TGetOrganizationsDTO) => {
    return orgDAL.findOrganizationsByFilter({
      offset,
      searchTerm,
      sortBy: "name",
      limit
    });
  };

  const createOrganization = async (
    { name, inviteAdminEmails: emails }: TCreateOrganizationDTO,
    actor: OrgServiceActor
  ) => {
    const appCfg = getConfig();

    const inviteAdminEmails = [...new Set(emails)].map((el) => sanitizeEmail(el));

    if (!appCfg.isDevelopmentMode && appCfg.isCloud)
      throw new BadRequestError({ message: "This endpoint is not supported for cloud instances" });

    const serverAdmin = await userDAL.findById(actor.id);
    const instancePlan = licenseService.getInstanceEntitlements().plan();

    const isEmailInvalid = isDisposableEmail(inviteAdminEmails);
    if (isEmailInvalid) {
      throw new BadRequestError({
        message: "Disposable emails are not allowed",
        name: "InviteUser"
      });
    }

    const invalidEmailFormats = inviteAdminEmails.filter((email) => {
      try {
        validateEmail(email);
        return false;
      } catch {
        return true;
      }
    });
    if (invalidEmailFormats.length > 0) {
      throw new BadRequestError({
        message: `Invalid email formats: ${invalidEmailFormats.join(", ")}`,
        name: "InviteUser"
      });
    }

    if (instancePlan.isLimited(PlanLimit.Identities)) {
      const { identitiesUsed } = await licenseService.getSeatUsage(null);
      if (instancePlan.exceeds(PlanLimit.Identities, identitiesUsed)) {
        throw new BadRequestError({
          name: "InviteUser",
          message: "Failed to invite member due to member limit reached. Upgrade plan to invite more members."
        });
      }
    }

    const { organization, users: usersToEmail } = await orgDAL.transaction(async (tx) => {
      const org = await orgService.createOrganization({ orgName: name }, tx);

      const users: Pick<TUsers, "id" | "firstName" | "lastName" | "email" | "username" | "isAccepted">[] = [];

      for await (const inviteeEmail of inviteAdminEmails) {
        let inviteeUser = await userDAL.findOne({ username: inviteeEmail }, tx);
        // if the user doesn't exist we create the user with the email
        if (!inviteeUser) {
          inviteeUser = await userDAL.create(
            {
              isAccepted: false,
              email: inviteeEmail,
              username: inviteeEmail,
              authMethods: [AuthMethod.EMAIL],
              isGhost: false
            },
            tx
          );
        }

        const inviteeUserId = inviteeUser?.id;
        const existingEncryptionKey = await userDAL.findUserEncKeyByUserId(inviteeUserId, tx);

        // when user is missing the encrytion keys
        // this could happen either if user doesn't exist or user didn't find step 3 of generating the encryption keys of srp
        // So what we do is we generate a random secure password and then encrypt it with a random pub-private key
        // Then when user sign in (as login is not possible as isAccepted is false) we rencrypt the private key with the user password
        if (!inviteeUser || (inviteeUser && !inviteeUser?.isAccepted && !existingEncryptionKey)) {
          await userDAL.createUserEncryption(
            {
              userId: inviteeUserId,
              encryptionVersion: 2
            },
            tx
          );
        }

        const membership = await orgDAL.createMembership(
          {
            actorUserId: inviteeUser.id,
            scope: AccessScope.Organization,
            inviteEmail: inviteeEmail,
            scopeOrgId: org.id,
            status: inviteeUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited,
            isActive: true
          },
          tx
        );

        await membershipRoleDAL.create(
          {
            membershipId: membership.id,
            role: OrgMembershipRole.Admin
          },
          tx
        );

        users.push(inviteeUser);
      }

      return { organization: org, users };
    });

    await usageMeteringService.syncSeats(organization.id);
    usageMeteringService.emit(organization.id, Meter.PamIdentities);

    await Promise.allSettled(
      usersToEmail.map(async (user) => {
        if (!user.email) return;

        if (user.isAccepted) {
          return smtpService.sendMail({
            template: SmtpTemplates.OrgAssignment,
            subjectLine: "You've been added to an Infisical organization",
            recipients: [user.email],
            substitutions: {
              inviterFirstName: serverAdmin?.firstName,
              inviterUsername: serverAdmin?.email,
              organizationName: organization.name,
              email: user.email,
              organizationId: organization.id,
              callback_url: `${appCfg.SITE_URL}/login?org_id=${organization.id}`
            }
          });
        }

        // new user, send regular invite

        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: user.id,
          orgId: organization.id
        });

        return smtpService.sendMail({
          template: SmtpTemplates.OrgInvite,
          subjectLine: "Infisical organization invitation",
          recipients: [user.email],
          substitutions: {
            inviterFirstName: serverAdmin?.firstName,
            inviterUsername: serverAdmin?.email,
            organizationName: organization.name,
            callback_url: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${encodeURIComponent(
              user.email
            )}&organization_id=${organization.id}`
          }
        });
      })
    );

    return organization;
  };

  const deleteOrganizationMembership = async (
    organizationId: string,
    membershipId: string,
    actorId: string,
    actorType: ActorType
  ) => {
    if (actorType === ActorType.USER) {
      const orgMembership = await membershipUserDAL.findOne({
        scope: AccessScope.Organization,
        id: membershipId,
        scopeOrgId: organizationId
      });
      if (!orgMembership) {
        throw new NotFoundError({ name: "Organization Membership", message: "Organization membership not found" });
      }

      if (orgMembership.actorUserId === actorId) {
        throw new BadRequestError({
          message: "You cannot remove yourself from the organization from the instance management panel."
        });
      }
    }

    const membershipRole = await membershipRoleDAL.findOne({ membershipId });
    if (!membershipRole) {
      throw new NotFoundError({ name: "Membership Role", message: "Membership role not found" });
    }
    const [organizationMembership] = await deleteOrgMembershipsFn({
      orgMembershipIds: [membershipId],
      orgId: organizationId,
      orgDAL,
      userAliasDAL,
      usageMeteringService,
      userId: actorType === ActorType.USER ? actorId : undefined,
      membershipUserDAL,
      userGroupMembershipDAL,
      projectAccessRevokeService,
      auditLogService,
      eventEmitter
    });

    usageMeteringService.emit(organizationId, Meter.SecretIdentities);
    usageMeteringService.emit(organizationId, Meter.PamIdentities);
    return { ...organizationMembership, role: membershipRole.role, orgId: organizationId };
  };

  const joinOrganization = async (orgId: string, actor: OrgServiceActor) => {
    const serverAdmin = await userDAL.findById(actor.id);

    if (!serverAdmin) {
      throw new NotFoundError({ message: "Could not find server admin user" });
    }

    const org = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));

    if (!org) {
      throw new NotFoundError({ message: `Could not organization with ID "${orgId}"` });
    }

    const existingOrgMembership = await membershipUserDAL.findOne({
      actorUserId: serverAdmin.id,
      scopeOrgId: org.id,
      scope: AccessScope.Organization
    });

    if (existingOrgMembership) {
      throw new BadRequestError({ message: `You are already a part of the organization with ID ${orgId}` });
    }

    const orgMembership = await orgDAL.transaction(async (tx) => {
      const membership = await orgDAL.createMembership(
        {
          actorUserId: serverAdmin.id,
          scopeOrgId: org.id,
          status: OrgMembershipStatus.Accepted,
          isActive: true,
          scope: AccessScope.Organization
        },
        tx
      );
      const membershipRole = await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: OrgMembershipRole.Admin
        },
        tx
      );
      return { ...membership, role: membershipRole.role, orgId: org.id };
    });

    return orgMembership;
  };

  const resendOrgInvite = async ({ organizationId, membershipId }: TResendOrgInviteDTO, actor: OrgServiceActor) => {
    const orgMembership = await membershipUserDAL.findOne({
      id: membershipId,
      scopeOrgId: organizationId,
      scope: AccessScope.Organization
    });

    if (!orgMembership) {
      throw new NotFoundError({ name: "Organization Membership", message: "Organization membership not found" });
    }

    if (orgMembership.status === OrgMembershipStatus.Accepted) {
      throw new BadRequestError({
        message: "This user has already accepted their invitation."
      });
    }

    if (!orgMembership.actorUserId) {
      throw new NotFoundError({ message: "Cannot find user associated with Org Membership." });
    }

    if (!orgMembership.inviteEmail) {
      throw new BadRequestError({ message: "No invite email associated with user." });
    }

    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgMembership.scopeOrgId), () =>
      orgDAL.findOrgById(orgMembership.scopeOrgId)
    );

    const appCfg = getConfig();
    const serverAdmin = await userDAL.findById(actor.id);

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: orgMembership.actorUserId,
      orgId: orgMembership.scopeOrgId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.OrgInvite,
      subjectLine: "Infisical organization invitation",
      recipients: [orgMembership.inviteEmail],
      substitutions: {
        inviterFirstName: serverAdmin?.firstName,
        inviterUsername: serverAdmin?.email,
        organizationName: org?.name,
        callback_url: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${encodeURIComponent(
          orgMembership.inviteEmail
        )}&organization_id=${orgMembership.scopeOrgId}`
      }
    });

    return { ...orgMembership, orgId: organizationId, role: "" };
  };

  const getIdentities = async ({ offset, limit, searchTerm }: TAdminGetIdentitiesDTO) => {
    const result = await identityDAL.getIdentitiesByFilter({
      limit,
      offset,
      searchTerm,
      sortBy: "name"
    });
    const { adminIdentityIds } = await instanceConfigService.getSettings();

    return {
      identities: result.identities.map((identity) => ({
        ...identity,
        isInstanceAdmin: Boolean(adminIdentityIds?.includes(identity.id))
      })),
      total: result.total
    };
  };

  const grantServerAdminAccessToUser = async (userId: string) => {
    if (!licenseService.getInstanceEntitlements().has(InstanceFeature.InstanceUserManagement)) {
      throw new BadRequestError({
        message: "Failed to grant server admin access to user due to plan restriction. Upgrade to Infisical's Pro plan."
      });
    }
    await userDAL.updateById(userId, { superAdmin: true });
  };

  const updateRootEncryptionStrategy = async (strategy: RootKeyEncryptionStrategy) => {
    if (!licenseService.getInstanceEntitlements().plan().has(PlanFeature.Hsm)) {
      throw new BadRequestError({
        message: "Failed to update encryption strategy due to plan restriction. Upgrade to Infisical's Enterprise plan."
      });
    }

    const configuredStrategies = await kmsRootKeyService.listEncryptionStrategies();

    const foundStrategy = configuredStrategies.strategies.find((s) => s.strategy === strategy);

    if (!foundStrategy) {
      throw new BadRequestError({ message: "Invalid encryption strategy" });
    }

    if (foundStrategy.enabled) {
      throw new BadRequestError({ message: "The selected encryption strategy is already enabled" });
    }

    await kmsRootKeyService.updateEncryptionStrategy(strategy);
  };

  const invalidateCache = async (type: CacheType) => {
    await invalidateCacheQueue.startInvalidate({
      data: { type }
    });
  };

  const checkIfInvalidatingCache = async () => {
    return (await keyStore.getItem(KeyStorePrefixes.InvalidatingCache)) !== null;
  };

  const getEmailDomains = async ({ offset, limit, searchTerm }: TAdminGetEmailDomainsDTO) => {
    return emailDomainDAL.findByFilter({ offset, limit, searchTerm });
  };

  const createEmailDomain = async ({ orgId, domain }: TAdminCreateEmailDomainDTO) => {
    const org = await requestMemoize(requestMemoKeys.orgFindOrgById(orgId), () => orgDAL.findOrgById(orgId));
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    const config = getConfig();
    if (!config.isCloud) {
      const plan = licenseService.getInstanceEntitlements().plan();
      const canEmailDomainVerification =
        plan.has(PlanFeature.SamlSso) || plan.has(PlanFeature.Ldap) || plan.has(PlanFeature.OidcSso);
      if (!canEmailDomainVerification) {
        throw new BadRequestError({
          message: "Failed to add email domain due to plan restriction. Upgrade plan to use email domain verification."
        });
      }
    }

    const emailDomain = await emailDomainDAL.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.EmailDomainCreationLock()]);

      // Check if any org (including this one) already has this domain verified
      const platformExisting = await emailDomainDAL.findOne(
        { domain: domain.toLowerCase(), status: EmailDomainStatus.Verified },
        tx
      );
      if (platformExisting) {
        return { error: "This domain is already verified by an organization.", data: null } as const;
      }

      const data = await emailDomainDAL.create(
        {
          orgId,
          domain: domain.toLowerCase(),
          verificationMethod: "admin",
          verificationCode: crypto.randomBytes(16).toString("hex"),
          verificationRecordName: `_infisical-verification.${domain.toLowerCase()}`,
          status: "verified",
          verifiedAt: new Date(),
          codeExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        },
        tx
      );

      return { error: undefined, data } as const;
    });

    if (emailDomain.error) {
      throw new BadRequestError({ message: emailDomain.error });
    }

    return emailDomain.data;
  };

  const deleteEmailDomain = async ({ emailDomainId }: TAdminDeleteEmailDomainDTO) => {
    const emailDomain = await emailDomainDAL.findById(emailDomainId);
    if (!emailDomain) throw new NotFoundError({ message: `Email domain with ID '${emailDomainId}' not found` });

    await emailDomainDAL.deleteById(emailDomainId);
    return emailDomain;
  };

  return {
    updateServerCfg,
    adminSignUp,
    bootstrapInstance,
    getUsers,
    deleteUser,
    getIdentities,
    updateRootEncryptionStrategy,
    grantServerAdminAccessToUser,
    deleteIdentitySuperAdminAccess,
    deleteUserSuperAdminAccess,
    invalidateCache,
    checkIfInvalidatingCache,
    getOrganizations,
    deleteOrganizationMembership,
    deleteUsers,
    createOrganization,
    joinOrganization,
    resendOrgInvite,
    getEmailDomains,
    createEmailDomain,
    deleteEmailDomain
  };
};
