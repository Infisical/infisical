import { Knex } from "knex";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TableName,
  TUsers,
  UserDeviceSchema
} from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto, generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import {
  BadRequestError,
  DatabaseError,
  ForbiddenRequestError,
  NotFoundError,
  UnauthorizedError
} from "@app/lib/errors";
import { getMinExpiresIn, removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { AuthAttemptAuthMethod, AuthAttemptAuthResult, authAttemptCounter } from "@app/lib/telemetry/metrics";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TOrgDALFactory } from "../org/org-dal";
import { getDefaultOrgMembershipRole } from "../org/org-role-fns";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { LoginMethod } from "../super-admin/super-admin-types";
import { TTotpServiceFactory } from "../totp/totp-service";
import { TUserDALFactory } from "../user/user-dal";
import { UserEncryption } from "../user/user-types";
import { enforceUserLockStatus, getAuthMethodAndOrgId, validateProviderAuthToken, verifyCaptcha } from "./auth-fns";
import {
  TLoginClientProofDTO,
  TLoginGenServerPublicKeyDTO,
  TOauthLoginDTO,
  TOauthTokenExchangeDTO,
  TVerifyMfaTokenDTO
} from "./auth-login-type";
import {
  ActorType,
  AuthMethod,
  AuthModeJwtTokenPayload,
  AuthModeMfaJwtTokenPayload,
  AuthTokenType,
  MfaMethod
} from "./auth-type";

type TAuthLoginServiceFactoryDep = {
  userDAL: TUserDALFactory;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  totpService: Pick<TTotpServiceFactory, "verifyUserTotp" | "verifyWithUserRecoveryCode">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({
  userDAL,
  tokenService,
  smtpService,
  orgDAL,
  totpService,
  auditLogService,
  notificationService,
  membershipUserDAL,
  membershipRoleDAL,
  keyStore
}: TAuthLoginServiceFactoryDep) => {
  /*
   * Private
   * Not exported. This is to update user device list
   * If new device is found. Will be saved and a mail will be send
   */
  const updateUserDeviceSession = async (user: TUsers, ip: string, userAgent: string, tx?: Knex) => {
    const devices = await UserDeviceSchema.parseAsync(user.devices || []);
    const isDeviceSeen = devices.some((device) => device.ip === ip && device.userAgent === userAgent);

    if (!isDeviceSeen) {
      const newDeviceList = devices.concat([{ ip, userAgent }]);
      await userDAL.updateById(user.id, { devices: JSON.stringify(newDeviceList) }, tx);

      await notificationService.createUserNotifications([
        {
          userId: user.id,
          type: NotificationType.LOGIN_FROM_NEW_DEVICE,
          title: "Login From New Device",
          body: `A new device with IP **${ip}** and User Agent **${userAgent}** has logged into your account.`
        }
      ]);

      if (user.email) {
        await smtpService.sendMail({
          template: SmtpTemplates.NewDeviceJoin,
          subjectLine: "Successful login from new device",
          recipients: [user.email],
          substitutions: {
            email: user.email,
            timestamp: new Date().toString(),
            ip,
            userAgent
          }
        });
      }
    }
  };

  /*
   * Private
   * Send mfa code via email
   * */
  const sendUserMfaCode = async ({ userId, email }: { userId: string; email: string }) => {
    const code = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailMfa,
      subjectLine: "Infisical MFA code",
      recipients: [email],
      substitutions: {
        code
      }
    });
  };

  /*
   * Check user device and send mail if new device
   * generate the auth and refresh token. fn shared by mfa verification and login verification with mfa disabled
   */
  const generateUserTokens = async (
    {
      user,
      ip,
      userAgent,
      organizationId,
      subOrganizationId,
      authMethod,
      isMfaVerified,
      mfaMethod
    }: {
      user: TUsers;
      ip: string;
      userAgent: string;
      organizationId?: string;
      subOrganizationId?: string;
      authMethod: AuthMethod;
      isMfaVerified?: boolean;
      mfaMethod?: MfaMethod;
    },
    tx?: Knex
  ) => {
    const cfg = getConfig();
    await updateUserDeviceSession(user, ip, userAgent, tx);
    const tokenSession = await tokenService.getUserTokenSession(
      {
        userAgent,
        ip,
        userId: user.id
      },
      tx
    );
    if (!tokenSession) throw new Error("Failed to create token");

    let tokenSessionExpiresIn: string | number = cfg.JWT_AUTH_LIFETIME;
    let refreshTokenExpiresIn: string | number = cfg.JWT_REFRESH_LIFETIME;

    if (organizationId) {
      const org = await orgDAL.findById(organizationId);
      if (org) {
        await membershipUserDAL.update(
          { actorUserId: user.id, scopeOrgId: org.id, scope: AccessScope.Organization },
          { lastLoginAuthMethod: authMethod, lastLoginTime: new Date() }
        );
        if (org.userTokenExpiration) {
          tokenSessionExpiresIn = getMinExpiresIn(cfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
          refreshTokenExpiresIn = org.userTokenExpiration;
        }
      }
    }

    const accessToken = crypto.jwt().sign(
      {
        authMethod,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion,
        organizationId,
        subOrganizationId,
        isMfaVerified,
        mfaMethod
      },
      cfg.AUTH_SECRET,
      { expiresIn: tokenSessionExpiresIn }
    );

    const refreshToken = crypto.jwt().sign(
      {
        authMethod,
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion,
        organizationId,
        subOrganizationId,
        isMfaVerified,
        mfaMethod
      },
      cfg.AUTH_SECRET,
      { expiresIn: refreshTokenExpiresIn }
    );

    return { access: accessToken, refresh: refreshToken };
  };

  /*
   * Step 1 of login. To get server public key in exchange of client public key
   */
  const loginGenServerPublicKey = async ({
    email,
    providerAuthToken,
    clientPublicKey
  }: TLoginGenServerPublicKeyDTO) => {
    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];

    const serverCfg = await getServerCfg();

    if (!userEnc || (userEnc && !userEnc.isAccepted)) {
      throw new Error("Failed to find user");
    }

    if (!userEnc.salt || !userEnc.verifier) {
      throw new BadRequestError({ message: "Salt or verifier not found" });
    }

    if (
      serverCfg.enabledLoginMethods &&
      !serverCfg.enabledLoginMethods.includes(LoginMethod.EMAIL) &&
      !providerAuthToken
    ) {
      // bypass server configuration when user is an organization admin - this is to prevent lockout
      const userOrgs = await orgDAL.findAllOrgsByUserId(userEnc.userId);
      if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
        throw new BadRequestError({
          message: "Login with email is disabled by administrator."
        });
      }
    }

    if (!userEnc.authMethods?.includes(AuthMethod.EMAIL)) {
      validateProviderAuthToken(providerAuthToken as string, email);
    }

    const serverSrpKey = await generateSrpServerKey(userEnc.salt, userEnc.verifier);
    const userEncKeys = await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      clientPublicKey,
      serverPrivateKey: serverSrpKey.privateKey
    });
    if (!userEncKeys) throw new Error("Failed  to update encryption key");
    return { salt: userEncKeys.salt, serverPublicKey: serverSrpKey.pubKey };
  };

  /*
   * Step 2 of login. Pass the client proof and with multi factor setup handle the required steps
   */
  const loginExchangeClientProof = async ({
    email,
    clientProof,
    ip,
    userAgent,
    providerAuthToken,
    captchaToken,
    password
  }: TLoginClientProofDTO) => {
    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    if (!userEnc) throw new Error("Failed to find user");
    const user = await userDAL.findById(userEnc.userId);
    const cfg = getConfig();

    const { authMethod, organizationId } = getAuthMethodAndOrgId(email, providerAuthToken);
    await verifyCaptcha(user, captchaToken);

    if (!userEnc.salt || !userEnc.verifier) {
      throw new BadRequestError({ message: "Salt or verifier not found" });
    }

    if (!userEnc.serverPrivateKey || !userEnc.clientPublicKey) throw new Error("Failed to authenticate. Try again?");
    const isValidClientProof = await srpCheckClientProof(
      userEnc.salt,
      userEnc.verifier,
      userEnc.serverPrivateKey,
      userEnc.clientPublicKey,
      clientProof
    );

    if (!isValidClientProof) {
      await userDAL.update(
        { id: userEnc.userId },
        {
          $incr: {
            consecutiveFailedPasswordAttempts: 1
          }
        }
      );

      throw new Error("Failed to authenticate. Try again?");
    }

    await userDAL.updateById(userEnc.userId, {
      consecutiveFailedPasswordAttempts: 0
    });
    // from password decrypt the private key
    if (password) {
      const privateKey = await getUserPrivateKey(password, userEnc).catch((err) => {
        logger.error(
          err,
          `loginExchangeClientProof: private key generation failed for [userId=${user.id}] and [email=${user.email}] `
        );
        return "";
      });

      const hashedPassword = await crypto.hashing().createHash(password, cfg.SALT_ROUNDS);

      const { iv, tag, ciphertext, encoding } = crypto
        .encryption()
        .symmetric()
        .encryptWithRootEncryptionKey(privateKey);

      await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
        serverPrivateKey: null,
        clientPublicKey: null,
        hashedPassword,
        serverEncryptedPrivateKey: ciphertext,
        serverEncryptedPrivateKeyIV: iv,
        serverEncryptedPrivateKeyTag: tag,
        serverEncryptedPrivateKeyEncoding: encoding
      });
    } else {
      await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
        serverPrivateKey: null,
        clientPublicKey: null
      });
    }

    const token = await generateUserTokens({
      user: {
        ...userEnc,
        id: userEnc.userId
      },
      ip,
      userAgent,
      authMethod,
      organizationId
    });

    return { token, user: userEnc } as const;
  };

  const login = async ({
    email,
    password,
    ip,
    userAgent,
    providerAuthToken,
    captchaToken
  }: {
    email: string;
    password: string;
    ip: string;
    userAgent: string;
    providerAuthToken?: string;
    captchaToken?: string;
  }) => {
    const appCfg = getConfig();

    try {
      const usersByUsername = await userDAL.findUserEncKeyByUsername({
        username: email
      });
      const userEnc =
        usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];

      if (!userEnc) throw new BadRequestError({ message: "User not found" });

      if (userEnc.encryptionVersion !== UserEncryption.V2) {
        throw new BadRequestError({
          message: "Legacy encryption scheme not supported",
          name: "LegacyEncryptionScheme"
        });
      }

      if (!userEnc.hashedPassword) {
        if (userEnc.authMethods?.includes(AuthMethod.EMAIL)) {
          throw new BadRequestError({
            message: "Legacy encryption scheme not supported",
            name: "LegacyEncryptionScheme"
          });
        }

        throw new BadRequestError({ message: "No password found" });
      }

      const { authMethod, organizationId } = getAuthMethodAndOrgId(email, providerAuthToken);
      await verifyCaptcha(userEnc, captchaToken);

      if (!(await crypto.hashing().compareHash(password, userEnc.hashedPassword))) {
        await userDAL.update(
          { id: userEnc.userId },
          {
            $incr: {
              consecutiveFailedPasswordAttempts: 1
            }
          }
        );

        throw new BadRequestError({ message: "Invalid username or email" });
      }

      const token = await generateUserTokens({
        user: {
          ...userEnc,
          id: userEnc.userId
        },
        ip,
        userAgent,
        authMethod,
        organizationId
      });

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.organization.id": organizationId,
          "infisical.user.email": email,
          "infisical.user.id": userEnc.userId,
          "infisical.auth.method": AuthAttemptAuthMethod.EMAIL,
          "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
          "client.address": ip,
          "user_agent.original": userAgent
        });
      }

      if (organizationId) {
        await auditLogService.createAuditLog({
          orgId: organizationId,
          ipAddress: ip,
          userAgent,
          userAgentType: getUserAgentType(userAgent),
          actor: {
            type: ActorType.USER,
            metadata: {
              email: userEnc.email,
              userId: userEnc.userId,
              username: userEnc.username,
              authMethod
            }
          },
          event: {
            type: EventType.USER_LOGIN,
            metadata: {
              organizationId
            }
          }
        });
      }

      return {
        tokens: {
          accessToken: token.access,
          refreshToken: token.refresh
        },
        user: userEnc
      } as const;
    } catch (error) {
      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.user.email": email,
          "infisical.auth.method": AuthAttemptAuthMethod.EMAIL,
          "infisical.auth.result": AuthAttemptAuthResult.FAILURE,
          "client.address": ip,
          "user_agent.original": userAgent
        });
      }

      throw error;
    }
  };

  const selectOrganization = async ({
    userAgent,
    authJwtToken,
    ipAddress,
    organizationId
  }: {
    userAgent: string | undefined;
    authJwtToken: string | undefined;
    ipAddress: string;
    organizationId: string;
  }) => {
    const cfg = getConfig();

    if (!authJwtToken) throw new UnauthorizedError({ name: "Authorization header is required" });
    if (!userAgent) throw new UnauthorizedError({ name: "User-Agent header is required" });

    // eslint-disable-next-line no-param-reassign
    authJwtToken = authJwtToken.replace("Bearer ", ""); // remove bearer from token

    // The decoded JWT token, which contains the auth method.
    const decodedToken = crypto.jwt().verify(authJwtToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;
    if (!decodedToken.authMethod) throw new UnauthorizedError({ name: "Auth method not found on existing token" });

    const user = await userDAL.findUserEncKeyByUserId(decodedToken.userId);
    if (!user) throw new BadRequestError({ message: "User not found", name: "Find user from token" });

    // Check user membership in the sub-organization (direct or via group)
    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.USER,
      actorId: user.id,
      orgId: organizationId,
      status: OrgMembershipStatus.Accepted
    });

    if (!orgMembership) {
      throw new ForbiddenRequestError({
        message: `User does not have access to the organization with ID ${organizationId}`
      });
    }

    const selectedOrg = await orgDAL.findById(organizationId);
    if (!selectedOrg) {
      throw new NotFoundError({ message: `Organization with ID '${organizationId}' not found` });
    }

    const isSubOrganization = Boolean(selectedOrg.rootOrgId && selectedOrg.id !== selectedOrg.rootOrgId);

    const membershipRole = (await membershipRoleDAL.findOne({ membershipId: orgMembership.id })).role;

    let rootOrg = selectedOrg;

    if (isSubOrganization) {
      if (!selectedOrg.rootOrgId) {
        throw new BadRequestError({
          message: "Invalid sub-organization"
        });
      }

      rootOrg = await orgDAL.findById(selectedOrg.rootOrgId);
      if (!rootOrg) {
        throw new BadRequestError({
          message: "Invalid sub-organization"
        });
      }

      // Check user membership in the root organization (direct or via group)
      const rootOrgMembership = await orgDAL.findEffectiveOrgMembership({
        actorType: ActorType.USER,
        actorId: user.id,
        orgId: selectedOrg.rootOrgId,
        status: OrgMembershipStatus.Accepted
      });

      if (!rootOrgMembership) {
        throw new ForbiddenRequestError({
          message: "User does not have access to the root organization"
        });
      }
    }

    if (
      rootOrg.authEnforced &&
      !isAuthMethodSaml(decodedToken.authMethod) &&
      decodedToken.authMethod !== AuthMethod.OIDC &&
      !(rootOrg.bypassOrgAuthEnabled && membershipRole === OrgMembershipRole.Admin)
    ) {
      throw new BadRequestError({
        message: "Login with the auth method required by your organization."
      });
    }

    if (rootOrg.googleSsoAuthEnforced && decodedToken.authMethod !== AuthMethod.GOOGLE) {
      const canBypass = rootOrg.bypassOrgAuthEnabled && membershipRole === OrgMembershipRole.Admin;

      if (!canBypass) {
        throw new ForbiddenRequestError({
          message: "Google SSO is enforced for this organization. Please use Google SSO to login.",
          error: "GoogleSsoEnforced"
        });
      }
    }

    if (decodedToken.authMethod === AuthMethod.GOOGLE) {
      await orgDAL.updateById(rootOrg.id, {
        googleSsoAuthLastUsed: new Date()
      });
    }

    const shouldCheckMfa = rootOrg.enforceMfa || user.isMfaEnabled;
    const orgMfaMethod = rootOrg.enforceMfa ? (rootOrg.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const userMfaMethod = user.isMfaEnabled ? (user.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const mfaMethod = orgMfaMethod ?? userMfaMethod;

    if (shouldCheckMfa && (!decodedToken.isMfaVerified || decodedToken.mfaMethod !== mfaMethod)) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const mfaToken = crypto.jwt().sign(
        {
          authMethod: decodedToken.authMethod,
          authTokenType: AuthTokenType.MFA_TOKEN,
          userId: user.id
        },
        cfg.AUTH_SECRET,
        {
          expiresIn: cfg.JWT_MFA_LIFETIME
        }
      );

      if (mfaMethod === MfaMethod.EMAIL && user.email) {
        await sendUserMfaCode({
          userId: user.id,
          email: user.email
        });
      }

      return { isMfaEnabled: true, mfa: mfaToken, mfaMethod } as const;
    }

    const tokens = await generateUserTokens({
      authMethod: decodedToken.authMethod,
      user,
      userAgent,
      ip: ipAddress,
      organizationId: isSubOrganization ? rootOrg.id : organizationId,
      subOrganizationId: isSubOrganization ? organizationId : undefined,
      isMfaVerified: decodedToken.isMfaVerified,
      mfaMethod: decodedToken.mfaMethod
    });

    // In the event of this being a break-glass request (non-saml / non-oidc, when either is enforced)
    if (
      rootOrg.authEnforced &&
      rootOrg.bypassOrgAuthEnabled &&
      !isAuthMethodSaml(decodedToken.authMethod) &&
      decodedToken.authMethod !== AuthMethod.OIDC &&
      decodedToken.authMethod !== AuthMethod.GOOGLE
    ) {
      await auditLogService.createAuditLog({
        orgId: organizationId,
        ipAddress,
        userAgent,
        userAgentType: getUserAgentType(userAgent),
        actor: {
          type: ActorType.USER,
          metadata: {
            email: user.email,
            userId: user.id,
            username: user.username
          }
        },
        event: {
          type: EventType.ORG_ADMIN_BYPASS_SSO,
          metadata: {}
        }
      });

      // Notify all admins via email (besides the actor)
      const orgAdmins = await orgDAL.findOrgMembersByRole(organizationId, OrgMembershipRole.Admin);
      const adminEmails = orgAdmins
        .filter((admin) => admin.user.id !== user.id)
        .map((admin) => admin.user.email)
        .filter(Boolean) as string[];

      if (adminEmails.length > 0) {
        await notificationService.createUserNotifications(
          orgAdmins
            .filter((admin) => admin.user.id !== user.id)
            .map((admin) => ({
              userId: admin.user.id,
              orgId: organizationId,
              type: NotificationType.ADMIN_SSO_BYPASS,
              title: "Security Alert: Admin SSO Bypass",
              body: `The org admin **${user.email}** has bypassed enforced SSO login.`
            }))
        );

        await smtpService.sendMail({
          recipients: adminEmails,
          subjectLine: "Security Alert: Admin SSO Bypass",
          substitutions: {
            email: user.email,
            timestamp: new Date().toISOString(),
            ip: ipAddress,
            userAgent,
            siteUrl: removeTrailingSlash(cfg.SITE_URL || "https://app.infisical.com"),
            orgId: organizationId
          },
          template: SmtpTemplates.OrgAdminBreakglassAccess
        });
      }
    }

    // Create audit log for organization selection
    if (isSubOrganization) {
      await auditLogService.createAuditLog({
        orgId: organizationId,
        ipAddress,
        userAgent,
        userAgentType: getUserAgentType(userAgent),
        actor: {
          type: ActorType.USER,
          metadata: {
            email: user.email,
            userId: user.id,
            username: user.username,
            authMethod: decodedToken.authMethod
          }
        },
        event: {
          type: EventType.SELECT_SUB_ORGANIZATION,
          metadata: {
            organizationId,
            organizationName: selectedOrg.name,
            rootOrganizationId: selectedOrg.rootOrgId || ""
          }
        }
      });
    } else {
      await auditLogService.createAuditLog({
        orgId: organizationId,
        ipAddress,
        userAgent,
        userAgentType: getUserAgentType(userAgent),
        actor: {
          type: ActorType.USER,
          metadata: {
            email: user.email,
            userId: user.id,
            username: user.username,
            authMethod: decodedToken.authMethod
          }
        },
        event: {
          type: EventType.SELECT_ORGANIZATION,
          metadata: {
            organizationId,
            organizationName: selectedOrg.name
          }
        }
      });
    }
    return {
      ...tokens,
      user,
      isMfaEnabled: false
    };
  };

  /*
   * Multi factor authentication re-send code, Get user id from token
   * saved in frontend
   */
  const resendMfaToken = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user || !user.email) return;
    enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);
    await sendUserMfaCode({
      userId: user.id,
      email: user.email
    });
  };

  const processFailedMfaAttempt = async (userId: string) => {
    try {
      const updatedUser = await userDAL.transaction(async (tx) => {
        const PROGRESSIVE_DELAY_INTERVAL = 3;
        const user = await userDAL.updateById(userId, { $incr: { consecutiveFailedMfaAttempts: 1 } }, tx);

        if (!user) {
          throw new Error("User not found");
        }

        const progressiveDelaysInMins = [5, 30, 60];

        // lock user when failed attempt exceeds threshold
        if (
          user.consecutiveFailedMfaAttempts &&
          user.consecutiveFailedMfaAttempts >= PROGRESSIVE_DELAY_INTERVAL * (progressiveDelaysInMins.length + 1)
        ) {
          return userDAL.updateById(
            userId,
            {
              isLocked: true,
              temporaryLockDateEnd: null
            },
            tx
          );
        }

        // delay user only when failed MFA attempts is a multiple of configured delay interval
        if (user.consecutiveFailedMfaAttempts && user.consecutiveFailedMfaAttempts % PROGRESSIVE_DELAY_INTERVAL === 0) {
          const delayIndex = user.consecutiveFailedMfaAttempts / PROGRESSIVE_DELAY_INTERVAL - 1;
          return userDAL.updateById(
            userId,
            {
              temporaryLockDateEnd: new Date(new Date().getTime() + progressiveDelaysInMins[delayIndex] * 60 * 1000)
            },
            tx
          );
        }

        return user;
      });

      return updatedUser;
    } catch (error) {
      throw new DatabaseError({ error, name: "Process failed MFA Attempt" });
    }
  };

  /*
   * Multi factor authentication verification of code
   * Third step of login in which user completes with mfa
   * */
  const verifyMfaToken = async ({
    userId,
    mfaToken,
    mfaMethod,
    mfaJwtToken,
    ip,
    userAgent,
    orgId,
    isRecoveryCode = false
  }: TVerifyMfaTokenDTO) => {
    const appCfg = getConfig();
    const user = await userDAL.findById(userId);

    try {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);
      if (mfaMethod === MfaMethod.EMAIL) {
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_MFA,
          userId,
          code: mfaToken
        });
      } else if (mfaMethod === MfaMethod.TOTP) {
        if (isRecoveryCode) {
          await totpService.verifyWithUserRecoveryCode({
            userId,
            recoveryCode: mfaToken
          });
        } else {
          if (mfaToken.length !== 6) {
            throw new BadRequestError({
              message: "Please use a valid TOTP code."
            });
          }
          await totpService.verifyUserTotp({
            userId,
            totp: mfaToken
          });
        }
      } else if (mfaMethod === MfaMethod.WEBAUTHN) {
        if (!mfaToken) {
          throw new BadRequestError({
            message: "WebAuthn session token is required"
          });
        }
        // Validate the one-time WebAuthn session token (passed as mfaToken)
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_WEBAUTHN_SESSION,
          userId,
          code: mfaToken
        });
      }
    } catch (err) {
      const updatedUser = await processFailedMfaAttempt(userId);
      if (updatedUser.isLocked) {
        if (updatedUser.email) {
          // Use a keystore lock to prevent sending duplicate unlock emails during concurrent requests
          let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
          try {
            lock = await keyStore.acquireLock([KeyStorePrefixes.UserMfaLockoutLock(userId)], 3000, {
              retryCount: 0
            });

            // Check if an unlock email was already sent recently (within 5 minutes)
            const emailAlreadySent = await keyStore.getItem(KeyStorePrefixes.UserMfaUnlockEmailSent(userId));
            if (!emailAlreadySent) {
              const unlockToken = await tokenService.createTokenForUser({
                type: TokenType.TOKEN_USER_UNLOCK,
                userId: updatedUser.id
              });

              await smtpService.sendMail({
                template: SmtpTemplates.UnlockAccount,
                subjectLine: "Unlock your Infisical account",
                recipients: [updatedUser.email],
                substitutions: {
                  token: unlockToken,
                  callback_url: `${appCfg.SITE_URL}/api/v1/user/${updatedUser.id}/unlock`
                }
              });

              // Mark that an unlock email was sent, expires after 5 minutes
              await keyStore.setItemWithExpiry(KeyStorePrefixes.UserMfaUnlockEmailSent(userId), 300, "1");
            }
          } catch (lockErr) {
            if (lock) {
              logger.error(lockErr, "Failed to send unlock email");
            }
          } finally {
            if (lock) {
              await lock.release();
            }
          }
        }
      }

      throw err;
    }

    const decodedToken = crypto.jwt().verify(mfaJwtToken, getConfig().AUTH_SECRET) as AuthModeMfaJwtTokenPayload;

    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    // reset lock states
    await userDAL.updateById(userId, {
      consecutiveFailedMfaAttempts: 0,
      temporaryLockDateEnd: null
    });

    const token = await generateUserTokens({
      user: {
        ...userEnc,
        id: userEnc.userId
      },
      ip,
      userAgent,
      organizationId: orgId,
      authMethod: decodedToken.authMethod,
      isMfaVerified: true,
      mfaMethod
    });

    return { token, user: userEnc };
  };
  /*
   * OAuth2 login for google,github, and other oauth2 provider
   * */
  const oauth2Login = async ({ email, firstName, lastName, authMethod, callbackPort, orgSlug }: TOauthLoginDTO) => {
    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserByUsername(email);
    let user = usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    const serverCfg = await getServerCfg();

    if (serverCfg.enabledLoginMethods && user) {
      switch (authMethod) {
        case AuthMethod.GITHUB: {
          if (!serverCfg.enabledLoginMethods.includes(LoginMethod.GITHUB)) {
            // bypass server configuration when user is an organization admin - this is to prevent lockout
            const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
            if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
              throw new BadRequestError({
                message: "Login with Github is disabled by administrator.",
                name: "Oauth 2 login"
              });
            }
          }
          break;
        }
        case AuthMethod.GOOGLE: {
          if (!serverCfg.enabledLoginMethods.includes(LoginMethod.GOOGLE)) {
            // bypass server configuration when user is an organization admin - this is to prevent lockout
            const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
            if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
              throw new BadRequestError({
                message: "Login with Google is disabled by administrator.",
                name: "Oauth 2 login"
              });
            }
          }
          break;
        }
        case AuthMethod.GITLAB: {
          if (!serverCfg.enabledLoginMethods.includes(LoginMethod.GITLAB)) {
            // bypass server configuration when user is an organization admin - this is to prevent lockout
            const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
            if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
              throw new BadRequestError({
                message: "Login with Gitlab is disabled by administrator.",
                name: "Oauth 2 login"
              });
            }
          }
          break;
        }
        default:
          break;
      }
    }

    const appCfg = getConfig();

    let orgId = "";
    let orgName: undefined | string;
    if (!user) {
      // Create a new user based on oAuth
      if (!serverCfg?.allowSignUp) throw new BadRequestError({ message: "Sign up disabled", name: "Oauth 2 login" });

      if (serverCfg?.allowedSignUpDomain) {
        const domain = email.split("@")[1];
        const allowedDomains = serverCfg.allowedSignUpDomain.split(",").map((e) => e.trim());
        if (!allowedDomains.includes(domain))
          throw new BadRequestError({
            message: `Email with a domain (@${domain}) is not supported`,
            name: "Oauth 2 login"
          });
      }

      user = await userDAL.create({
        username: email.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        isEmailVerified: true,
        firstName,
        lastName,
        authMethods: [authMethod],
        isGhost: false
      });

      if (authMethod === AuthMethod.GITHUB && serverCfg.defaultAuthOrgId && !appCfg.isCloud) {
        const defaultOrg = await orgDAL.findOrgById(serverCfg.defaultAuthOrgId);
        if (!defaultOrg) {
          throw new BadRequestError({
            message: `Failed to find default organization with ID ${serverCfg.defaultAuthOrgId}`
          });
        }
        orgId = defaultOrg.id;
        const [orgMembership] = await orgDAL.findMembership({
          [`${TableName.Membership}.actorUserId` as "actorUserId"]: user.id,
          [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
          [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
        });

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(defaultOrg.defaultMembershipRole);

          await membershipUserDAL.transaction(async (tx) => {
            const membership = await membershipUserDAL.create(
              {
                actorUserId: user?.id,
                inviteEmail: email,
                scopeOrgId: orgId,
                scope: AccessScope.Organization,
                status: OrgMembershipStatus.Accepted,
                isActive: true
              },
              tx
            );
            await membershipRoleDAL.create(
              {
                membershipId: membership.id,
                role,
                customRoleId: roleId
              },
              tx
            );
          });
        }
      }
    } else {
      const isLinkingRequired = !user?.authMethods?.includes(authMethod);
      if (isLinkingRequired) {
        // we update the names here because upon org invitation, the names are set to be NULL
        // if user is signing up with SSO after invitation, their names should be set based on their SSO profile
        user = await userDAL.updateById(user.id, {
          authMethods: [...(user.authMethods || []), authMethod],
          firstName: !user.isAccepted ? firstName : undefined,
          lastName: !user.isAccepted ? lastName : undefined
        });
      }
    }

    if (!orgId && orgSlug) {
      const org = await orgDAL.findOrgBySlug(orgSlug);

      if (org) {
        // checks for the membership and only sets the orgId / orgName if the user is a member of the specified org
        const orgMembership = await orgDAL.findMembership({
          [`${TableName.Membership}.actorUserId` as "actorUserId"]: user.id,
          [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: org.id,
          [`${TableName.Membership}.isActive` as "isActive"]: true,
          [`${TableName.Membership}.status` as "status"]: OrgMembershipStatus.Accepted,
          [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
        });

        if (orgMembership) {
          orgId = org.id;
          orgName = org.name;
        }
      }
    }

    const isUserCompleted = user.isAccepted;
    const providerAuthToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,

        ...(orgId && orgSlug && orgName !== undefined
          ? {
              organizationId: orgId,
              organizationName: orgName,
              organizationSlug: orgSlug
            }
          : {}),

        username: user.username,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        hasExchangedPrivateKey: true,
        authMethod,
        isUserCompleted,
        ...(callbackPort
          ? {
              callbackPort
            }
          : {})
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );

    return { isUserCompleted, providerAuthToken, user, orgId, orgName };
  };

  /**
   * Handles OAuth2 token exchange for user login with private key handoff.
   *
   * The process involves exchanging a provider's authorization token for an Infisical access token.
   * The provider token is returned to the client, who then sends it back to obtain the Infisical access token.
   *
   * This approach is used instead of directly sending the access token for the following reasons:
   * 1. To facilitate easier logic changes from SRP OAuth to simple OAuth.
   * 2. To avoid attaching the access token to the URL, which could be logged. The provider token has a very short lifespan, reducing security risks.
   */
  const oauth2TokenExchange = async ({ userAgent, ip, providerAuthToken, email }: TOauthTokenExchangeDTO) => {
    const decodedProviderToken = validateProviderAuthToken(providerAuthToken, email);

    const { authMethod, userName } = decodedProviderToken;
    if (!userName) throw new BadRequestError({ message: "Missing user name" });
    const organizationId =
      (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod)) &&
      decodedProviderToken.orgId
        ? decodedProviderToken.orgId
        : undefined;

    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];

    if (!userEnc) throw new BadRequestError({ message: "User encryption not found" });

    const token = await generateUserTokens({
      user: { ...userEnc, id: userEnc.userId },
      ip,
      userAgent,
      authMethod,
      organizationId
    });

    if (organizationId) {
      await auditLogService.createAuditLog({
        orgId: organizationId,
        ipAddress: ip,
        userAgent,
        userAgentType: getUserAgentType(userAgent),
        actor: {
          type: ActorType.USER,
          metadata: {
            email: userEnc.email,
            userId: userEnc.userId,
            username: userEnc.username,
            authMethod: decodedProviderToken.authMethod
          }
        },
        event: {
          type: EventType.USER_LOGIN,
          metadata: {
            organizationId,
            ...(isAuthMethodSaml(decodedProviderToken.authMethod) && {
              authProvider: decodedProviderToken.authMethod
            })
          }
        }
      });
    }

    return { token, isMfaEnabled: false, user: userEnc, decodedProviderToken } as const;
  };

  /*
   * logout user by incrementing the version by 1 meaning any old session will become invalid
   * as there number is behind
   * */
  const logout = async (userId: string, sessionId: string) => {
    await tokenService.clearTokenSessionById(userId, sessionId);
  };

  return {
    loginGenServerPublicKey,
    loginExchangeClientProof,
    logout,
    oauth2Login,
    oauth2TokenExchange,
    resendMfaToken,
    verifyMfaToken,
    selectOrganization,
    generateUserTokens,
    login
  };
};
