import { Knex } from "knex";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TUsers,
  UserDeviceSchema
} from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { OrgPermissionSsoActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
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
import { validateEmail } from "@app/lib/validator";
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
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { UserAliasType } from "../user-alias/user-alias-types";
import { enforceUserLockStatus, verifyCaptcha } from "./auth-fns";
import {
  TLoginClientProofDTO,
  TLoginGenServerPublicKeyDTO,
  TOauthLoginDTO,
  TProcessProviderCallbackDTO,
  TVerifyMfaTokenDTO
} from "./auth-login-type";
import {
  ActorType,
  AuthMethod,
  AuthModeJwtTokenPayload,
  AuthModeMfaJwtTokenPayload,
  AuthTokenType,
  MfaMethod,
  ProviderAuthResult
} from "./auth-type";

type TAuthLoginServiceFactoryDep = {
  userDAL: TUserDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "create" | "updateById">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  totpService: Pick<TTotpServiceFactory, "verifyUserTotp" | "verifyWithUserRecoveryCode">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  notificationService: Pick<TNotificationServiceFactory, "createUserNotifications">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({
  userDAL,
  userAliasDAL,
  tokenService,
  smtpService,
  orgDAL,
  totpService,
  auditLogService,
  notificationService,
  membershipUserDAL,
  membershipRoleDAL,
  keyStore,
  permissionService
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
   * Private
   * Determines the required MFA method based on org enforcement vs user preference.
   */
  const getRequiredMfaMethod = (
    org: { enforceMfa?: boolean | null; selectedMfaMethod?: string | null },
    user: { isMfaEnabled?: boolean | null; selectedMfaMethod?: string | null }
  ): { isMfaRequired: boolean; requiredMfaMethod: MfaMethod } => {
    const isOrgMfaEnforced = Boolean(org.enforceMfa);
    const isUserMfaEnabled = Boolean(user.isMfaEnabled);
    const isMfaRequired = isOrgMfaEnforced || isUserMfaEnabled;

    const requiredMfaMethod = isOrgMfaEnforced
      ? ((org.selectedMfaMethod as MfaMethod) ?? MfaMethod.EMAIL)
      : ((user.selectedMfaMethod as MfaMethod) ?? MfaMethod.EMAIL);

    return { isMfaRequired, requiredMfaMethod };
  };

  /*
   * Private
   * Issues an MFA challenge: generates an MFA JWT token and sends the email code if needed.
   */
  const issueMfaChallenge = async ({
    userId,
    email,
    authMethod,
    organizationId,
    requiredMfaMethod
  }: {
    userId: string;
    email?: string | null;
    authMethod: AuthMethod;
    organizationId?: string;
    requiredMfaMethod: MfaMethod;
  }) => {
    const appCfg = getConfig();

    const mfaToken = crypto.jwt().sign(
      {
        authMethod,
        authTokenType: AuthTokenType.MFA_TOKEN,
        userId,
        organizationId,
        email
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_MFA_LIFETIME }
    );

    if (requiredMfaMethod === MfaMethod.EMAIL && email) {
      await sendUserMfaCode({ userId, email });
    }

    return mfaToken;
  };

  /*
   * Generate the auth and refresh token.
   * Shared by mfa verification, login verification with mfa disabled, and select organization.
   * Note: device tracking (updateUserDeviceSession) is intentionally NOT called here —
   * it must only run after full authentication (including MFA) is complete.
   */
  const generateUserTokens = async (
    {
      userId,
      ip,
      userAgent,
      organizationId,
      subOrganizationId,
      authMethod,
      isMfaVerified,
      mfaMethod
    }: {
      userId: string;
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
    const tokenSession = await tokenService.getUserTokenSession(
      {
        userAgent,
        ip,
        userId
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
          { actorUserId: userId, scopeOrgId: org.id, scope: AccessScope.Organization },
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
        userId,
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
        userId,
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
   * Shared pipeline called by all provider callbacks (OAuth, SAML, OIDC, LDAP).
   * Decides whether to:
   *   - Issue a session (refresh + access tokens)
   *   - Require MFA (for org-scoped IdP flows where org is already known)
   *   - Require signup/alias verification
   *
   * For OAuth (no organizationId): MFA is deferred to selectOrganization.
   * For IdP (SAML/OIDC/LDAP with organizationId): MFA is checked here.
   */
  const processProviderCallback = async ({
    user,
    authMethod,
    isEmailVerified,
    aliasId,
    ip,
    userAgent,
    organizationId,
    callbackPort
  }: TProcessProviderCallbackDTO) => {
    const appCfg = getConfig();

    if (!user.isAccepted || !isEmailVerified) {
      const signupToken = crypto.jwt().sign(
        {
          authTokenType: AuthTokenType.SIGNUP_TOKEN,
          userId: user.id,
          authMethod,
          isEmailVerified,
          aliasId,
          organizationId,
          callbackPort,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        },
        appCfg.AUTH_SECRET,
        { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
      );

      return { result: ProviderAuthResult.SIGNUP_REQUIRED, signupToken, callbackPort } as const;
    }

    // let them select the org and do the mfa
    const tokens = await generateUserTokens({
      userId: user.id,
      ip,
      userAgent,
      authMethod
    });

    if (organizationId) {
      await membershipUserDAL.update(
        {
          actorUserId: user.id,
          scopeOrgId: organizationId,
          scope: AccessScope.Organization,
          status: OrgMembershipStatus.Invited
        },
        { status: OrgMembershipStatus.Accepted }
      );
    }

    return { result: ProviderAuthResult.SESSION, tokens, callbackPort } as const;
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
      // Deprecated: provider token validation removed. This path is only reachable from legacy SRP clients.
      if (!providerAuthToken) throw new UnauthorizedError();
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

    // Deprecated SRP path: default to email auth. Provider token exchange is no longer supported.
    const authMethod = AuthMethod.EMAIL;
    const organizationId: string | undefined = undefined;
    await verifyCaptcha(user.consecutiveFailedPasswordAttempts, captchaToken);

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
      userId: userEnc.userId,
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
    captchaToken
  }: {
    email: string;
    password: string;
    ip: string;
    userAgent: string;
    captchaToken?: string;
  }) => {
    const appCfg = getConfig();

    try {
      const user = await userDAL.findOne({ username: email });
      if (!user) {
        logger.error(`Failed to find user for email ${email}`);
        throw new BadRequestError({ message: "Invalid credentials" });
      }

      if (!user.authMethods?.includes(AuthMethod.EMAIL) || !user.hashedPassword || !user.isEmailVerified) {
        logger.error(`User doesn't have email auth enabled ${email}`);
        throw new BadRequestError({ message: "Invalid credentials" });
      }

      await verifyCaptcha(user.consecutiveFailedPasswordAttempts, captchaToken);

      if (!(await crypto.hashing().compareHash(password, user.hashedPassword))) {
        await userDAL.update(
          { id: user.id },
          {
            $incr: {
              consecutiveFailedPasswordAttempts: 1
            }
          }
        );

        throw new BadRequestError({ message: "Invalid credentials" });
      }

      const token = await generateUserTokens({
        userId: user.id,
        ip,
        userAgent,
        authMethod: AuthMethod.EMAIL
      });

      if (appCfg.OTEL_TELEMETRY_COLLECTION_ENABLED) {
        authAttemptCounter.add(1, {
          "infisical.user.email": email,
          "infisical.user.id": user.id,
          "infisical.auth.method": AuthAttemptAuthMethod.EMAIL,
          "infisical.auth.result": AuthAttemptAuthResult.SUCCESS,
          "client.address": ip,
          "user_agent.original": userAgent
        });
      }

      return {
        tokens: {
          accessToken: token.access,
          refreshToken: token.refresh
        },
        user
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

    const userEnc = await userDAL.findById(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    // reset lock states
    await userDAL.updateById(userId, {
      consecutiveFailedMfaAttempts: 0,
      temporaryLockDateEnd: null
    });

    const token = await generateUserTokens({
      userId: user.id,
      ip,
      userAgent,
      organizationId: orgId,
      authMethod: decodedToken.authMethod,
      isMfaVerified: true,
      mfaMethod
    });

    return { token, user: { ...userEnc, hashedPassword: null } };
  };
  /*
   * OAuth2 login for google,github, and other oauth2 provider
   * */
  const authMethodToAliasType = (method: AuthMethod): UserAliasType => {
    switch (method) {
      case AuthMethod.GOOGLE:
        return UserAliasType.GOOGLE;
      case AuthMethod.GITHUB:
        return UserAliasType.GITHUB;
      case AuthMethod.GITLAB:
        return UserAliasType.GITLAB;
      default:
        throw new BadRequestError({ message: `Unsupported OAuth auth method: ${method}` });
    }
  };

  const oauth2Login = async ({
    email,
    firstName,
    lastName,
    authMethod,
    callbackPort,
    orgSlug,
    providerUserId,
    ip,
    userAgent
  }: TOauthLoginDTO) => {
    const aliasType = authMethodToAliasType(authMethod);
    const normalizedEmail = email.trim().toLowerCase();
    validateEmail(normalizedEmail);

    // Step 1: Look up user by provider alias (stable, immutable ID)
    let user: TUsers | undefined;
    let isNewAlias = false;
    let existingAlias = await userAliasDAL.findOne({ externalId: providerUserId, aliasType });
    if (existingAlias) {
      user = await userDAL.findById(existingAlias.userId);
    }

    // Step 2: Fall back to email lookup for existing users without an alias yet
    if (!user) {
      user = await userDAL.findOne({ username: normalizedEmail });
      if (user) {
        isNewAlias = true;
      }
    }

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

      user = await userDAL.transaction(async (tx) => {
        const newUser = await userDAL.create(
          {
            username: normalizedEmail,
            email: normalizedEmail,
            isEmailVerified: false,
            isAccepted: false,
            firstName,
            lastName,
            authMethods: [authMethod],
            isGhost: false
          },
          tx
        );

        if (authMethod === AuthMethod.GITHUB && serverCfg.defaultAuthOrgId && !appCfg.isCloud) {
          const defaultOrg = await orgDAL.findOrgById(serverCfg.defaultAuthOrgId);
          if (!defaultOrg) {
            throw new BadRequestError({
              message: `Failed to find default organization with ID ${serverCfg.defaultAuthOrgId}`
            });
          }
          orgId = defaultOrg.id;
          const existingMembership = await orgDAL.findMembership({
            actorUserId: newUser.id,
            scopeOrgId: orgId,
            scope: AccessScope.Organization
          });

          if (!existingMembership) {
            const { role, roleId } = await getDefaultOrgMembershipRole(defaultOrg.defaultMembershipRole);

            const membership = await membershipUserDAL.create(
              {
                actorUserId: newUser.id,
                inviteEmail: normalizedEmail,
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
          }
        }

        existingAlias = await userAliasDAL.create(
          {
            userId: newUser.id,
            aliasType,
            externalId: providerUserId,
            emails: [normalizedEmail],
            orgId: orgId || null,
            isEmailVerified: false
          },
          tx
        );

        return newUser;
      });
    } else {
      const isLinkingRequired = !user?.authMethods?.includes(authMethod);
      if (isLinkingRequired) {
        // we update the names here because upon org invitation, the names are set to be NULL
        // if user is signing up with SSO after invitation, their names should be set based on their SSO profile
        user = await userDAL.updateById(user.id, {
          authMethods: [...(user.authMethods || []), authMethod],
          firstName,
          lastName
        });
      }

      if (existingAlias && user.email !== normalizedEmail) {
        const conflictingUser = await userDAL.findOne({ username: normalizedEmail });
        if (conflictingUser && conflictingUser.id !== user.id) {
          throw new BadRequestError({
            message:
              "Unable to complete login: the email associated with your SSO account is already in use by another Infisical user.",
            name: "Oauth 2 login"
          });
        }

        user = await userDAL.transaction(async (tx) => {
          const updatedUser = await userDAL.updateById(
            user!.id,
            {
              username: normalizedEmail,
              email: normalizedEmail,
              isGitHubVerified: authMethod !== AuthMethod.GITHUB && user?.isGitHubVerified,
              isGoogleVerified: authMethod !== AuthMethod.GOOGLE && user?.isGoogleVerified,
              isGitLabVerified: authMethod !== AuthMethod.GITLAB && user?.isGitLabVerified
            },
            tx
          );

          await userAliasDAL.updateById(
            existingAlias.id,
            {
              emails: [normalizedEmail]
            },
            tx
          );

          return updatedUser;
        });
      }
    }

    if (!orgId && orgSlug) {
      const org = await orgDAL.findOrgBySlug(orgSlug);

      if (org) {
        // checks for the membership and only sets the orgId / orgName if the user is a member of the specified org (direct or via group)
        const orgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: user.id,
          orgId: org.id,
          status: OrgMembershipStatus.Accepted
        });

        if (orgMembership?.isActive) {
          orgId = org.id;
          orgName = org.name;
        }
      }
    }

    // Use user-level provider verification flags
    let isAliasVerified = false;
    if (authMethod === AuthMethod.GOOGLE) {
      isAliasVerified = Boolean(user.isGoogleVerified);
    } else if (authMethod === AuthMethod.GITHUB) {
      isAliasVerified = Boolean(user.isGitHubVerified);
    } else if (authMethod === AuthMethod.GITLAB) {
      isAliasVerified = Boolean(user.isGitLabVerified);
    }
    // Self-healing backfill: create alias for existing users found by email fallback
    let aliasId = existingAlias?.id;
    if (isNewAlias) {
      try {
        const newAlias = await userAliasDAL.create({
          userId: user.id,
          aliasType,
          externalId: providerUserId,
          emails: [email],
          isEmailVerified: isAliasVerified
        });
        aliasId = newAlias.id;
      } catch (err) {
        // Swallow duplicate key errors from the unique index (race condition: concurrent login already created the alias)
        if (err instanceof DatabaseError && (err.error as { code: string })?.code === "23505") {
          logger.warn(`OAuth alias backfill for user ${user.id} skipped: alias already exists`);
        } else {
          throw err;
        }
      }
    }

    // Send verification email for OAuth providers that haven't verified the user's email
    if (!isAliasVerified && user.email && aliasId) {
      const verificationCode = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id,
        aliasId
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: "Infisical confirmation code",
        recipients: [user.email],
        substitutions: {
          code: verificationCode
        }
      });
    }

    const callbackResult = await processProviderCallback({
      user,
      authMethod,
      isEmailVerified: isAliasVerified,
      aliasId,
      ip,
      userAgent,
      organizationId: orgId || undefined,
      callbackPort
    });

    return { ...callbackResult, user: { ...user, hashedPassword: null }, orgId, orgName };
  };

  /*
   * logout user by incrementing the version by 1 meaning any old session will become invalid
   * as there number is behind
   * */
  const logout = async (userId: string, sessionId: string) => {
    await tokenService.clearTokenSessionById(userId, sessionId);
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

    const user = await userDAL.findById(decodedToken.userId);
    if (!user || !user.isAccepted)
      throw new BadRequestError({ message: "User not found", name: "Find user from token" });

    // Check user membership in the organization (accept any status — promotion happens after auth)
    const orgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.USER,
      actorId: user.id,
      orgId: organizationId,
      acceptAnyStatus: true
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

      // Check user membership in the root organization (accept any status — promotion happens after auth)
      const rootOrgMembership = await membershipUserDAL.findOne({
        actorUserId: user.id,
        scopeOrgId: selectedOrg.rootOrgId,
        scope: AccessScope.Organization
      });

      if (!rootOrgMembership) {
        throw new ForbiddenRequestError({
          message: "User does not have access to the root organization"
        });
      }
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: user.id,
      orgId: rootOrg.id,
      actorAuthMethod: decodedToken.authMethod,
      actorOrgId: rootOrg.id,
      scope: OrganizationActionScope.Any
    });
    const canBypassSso =
      rootOrg.bypassOrgAuthEnabled &&
      permission.can(OrgPermissionSsoActions.BypassSsoEnforcement, OrgPermissionSubjects.Sso);

    if (
      rootOrg.authEnforced &&
      !isAuthMethodSaml(decodedToken.authMethod) &&
      decodedToken.authMethod !== AuthMethod.OIDC &&
      !canBypassSso
    ) {
      throw new BadRequestError({
        message: "Login with the auth method required by your organization."
      });
    }

    if (rootOrg.googleSsoAuthEnforced && decodedToken.authMethod !== AuthMethod.GOOGLE) {
      if (!canBypassSso) {
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

    const { isMfaRequired, requiredMfaMethod } = getRequiredMfaMethod(rootOrg, user);
    // Check if organization has changed
    const hasOrganizationChanged = decodedToken?.organizationId ? decodedToken.organizationId !== rootOrg.id : false;
    // Check if MFA method has changed
    const hasMfaMethodChanged = decodedToken.mfaMethod !== requiredMfaMethod;
    // Trigger MFA if required and either not verified or something changed
    const shouldTriggerMfa =
      isMfaRequired && (!decodedToken.isMfaVerified || hasMfaMethodChanged || hasOrganizationChanged);

    if (shouldTriggerMfa) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const mfaToken = await issueMfaChallenge({
        userId: user.id,
        email: user.email,
        authMethod: decodedToken.authMethod,
        requiredMfaMethod,
        organizationId: rootOrg.id
      });

      return { isMfaEnabled: true, mfa: mfaToken, mfaMethod: requiredMfaMethod } as const;
    }

    await updateUserDeviceSession(user, ipAddress, userAgent);

    const tokens = await generateUserTokens({
      authMethod: decodedToken.authMethod,
      userId: user.id,
      userAgent,
      ip: ipAddress,
      organizationId: isSubOrganization ? rootOrg.id : organizationId,
      subOrganizationId: isSubOrganization ? organizationId : undefined,
      isMfaVerified: decodedToken.isMfaVerified,
      mfaMethod: decodedToken.mfaMethod
    });

    // Promote any Invited memberships to Accepted now that the user has authenticated into this org
    await membershipUserDAL.update(
      {
        actorUserId: user.id,
        scopeOrgId: organizationId,
        scope: AccessScope.Organization,
        status: OrgMembershipStatus.Invited
      },
      { status: OrgMembershipStatus.Accepted }
    );

    // In the event of this being a break-glass request (non-saml / non-oidc / non-google, when any is enforced)
    const isAuthEnforcedBypass =
      rootOrg.authEnforced &&
      rootOrg.bypassOrgAuthEnabled &&
      !isAuthMethodSaml(decodedToken.authMethod) &&
      decodedToken.authMethod !== AuthMethod.OIDC &&
      decodedToken.authMethod !== AuthMethod.GOOGLE;
    const isGoogleSsoEnforcedBypass =
      rootOrg.googleSsoAuthEnforced && rootOrg.bypassOrgAuthEnabled && decodedToken.authMethod !== AuthMethod.GOOGLE;
    if (isAuthEnforcedBypass || isGoogleSsoEnforcedBypass) {
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
              title: "Security Alert: SSO Bypass",
              body: `The organization member **${user.email}** has bypassed enforced SSO login.`
            }))
        );

        await smtpService.sendMail({
          recipients: adminEmails,
          subjectLine: "Security Alert: SSO Bypass",
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
      event: isSubOrganization
        ? {
            type: EventType.SELECT_SUB_ORGANIZATION,
            metadata: {
              organizationId,
              organizationName: selectedOrg.name,
              rootOrganizationId: selectedOrg.rootOrgId || ""
            }
          }
        : {
            type: EventType.SELECT_ORGANIZATION,
            metadata: {
              organizationId,
              organizationName: selectedOrg.name
            }
          }
    });

    return {
      ...tokens,
      user,
      isMfaEnabled: false
    };
  };

  return {
    login,
    logout,
    oauth2Login,
    resendMfaToken,
    verifyMfaToken,
    selectOrganization,
    generateUserTokens,
    processProviderCallback,

    // deprecated completely
    loginGenServerPublicKey,
    loginExchangeClientProof
  };
};
