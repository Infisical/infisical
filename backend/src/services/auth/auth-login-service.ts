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
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
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
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  AuthAttemptAuthMethod,
  AuthAttemptAuthResult,
  authAttemptCounter,
  recordAuthAttemptMetric
} from "@app/lib/telemetry/metrics";
import { sanitizeEmail, validateEmail } from "@app/lib/validator";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TMfaRecoveryCodeServiceFactory } from "../mfa-recovery-code/mfa-recovery-code-service";
import { TNotificationServiceFactory } from "../notification/notification-service";
import { NotificationType } from "../notification/notification-types";
import { TOrgDALFactory } from "../org/org-dal";
import { getDefaultOrgMembershipRole } from "../org/org-role-fns";
import { SmtpTemplates, throwIfSmtpError, TSmtpService } from "../smtp/smtp-service";
import { LoginMethod } from "../super-admin/super-admin-types";
import { TTotpServiceFactory } from "../totp/totp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { ensureSsoAccountVerified, isStaleSsoAlias } from "../user-alias/user-alias-fns";
import { UserAliasType } from "../user-alias/user-alias-types";
import { enforceUserLockStatus, getRequiredMfaMethod, verifyCaptcha } from "./auth-fns";
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
  AuthModeMfaJwtTokenPayload,
  AuthTokenType,
  MfaMethod,
  ProviderAuthResult,
  TProviderAuthCallback
} from "./auth-type";

type TAuthLoginServiceFactoryDep = {
  userDAL: TUserDALFactory;
  userAliasDAL: Pick<TUserAliasDALFactory, "findOne" | "create" | "updateById">;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  totpService: Pick<TTotpServiceFactory, "verifyUserTotp">;
  mfaRecoveryCodeService: Pick<TMfaRecoveryCodeServiceFactory, "verifyAndConsumeRecoveryCode">;
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
  mfaRecoveryCodeService,
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
        await smtpService
          .sendMail({
            template: SmtpTemplates.NewDeviceJoin,
            subjectLine: "Successful login from new device",
            recipients: [user.email],
            substitutions: {
              email: user.email,
              timestamp: new Date().toString(),
              ip,
              userAgent
            }
          })
          .catch((err) => logger.error(err, "Failed to send new device login email"));
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

    await smtpService
      .sendMail({
        template: SmtpTemplates.EmailMfa,
        subjectLine: "Infisical MFA code",
        recipients: [email],
        substitutions: {
          code
        }
      })
      .catch((err) => throwIfSmtpError(err, "Failed to send MFA code email"));
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
    requiredMfaMethod,
    sendEmailCode = true
  }: {
    userId: string;
    email?: string | null;
    authMethod: AuthMethod;
    organizationId?: string;
    requiredMfaMethod: MfaMethod;
    sendEmailCode?: boolean;
  }) => {
    const appCfg = getConfig();

    const mfaToken = crypto.jwt().sign(
      {
        authMethod,
        authTokenType: AuthTokenType.MFA_TOKEN,
        userId,
        organizationId,
        email,
        requiredMfaMethod
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_MFA_LIFETIME }
    );

    if (requiredMfaMethod === MfaMethod.EMAIL && email && sendEmailCode) {
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
      const org = await requestMemoize(requestMemoKeys.orgFindById(organizationId), () =>
        orgDAL.findById(organizationId)
      );
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

  const processProviderCallback = async ({
    user,
    authMethod,
    isEmailVerified,
    aliasId,
    ip,
    userAgent,
    organizationId,
    callbackPort
  }: TProcessProviderCallbackDTO): Promise<TProviderAuthCallback> => {
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
    email: unsanitizedEmail,
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
    const authMetricStartTime = performance.now();
    const appCfg = getConfig();
    const email = sanitizeEmail(unsanitizedEmail);

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

      const serverCfg = await getServerCfg();
      if (serverCfg.enabledLoginMethods && !serverCfg.enabledLoginMethods.includes(LoginMethod.EMAIL)) {
        const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
        if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
          throw new BadRequestError({ message: "Invalid credentials" });
        }
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

      await userDAL.updateById(user.id, {
        consecutiveFailedPasswordAttempts: 0
      });
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

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.EMAIL,
        result: AuthAttemptAuthResult.SUCCESS
      });

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

      recordAuthAttemptMetric({
        startTime: authMetricStartTime,
        method: AuthAttemptAuthMethod.EMAIL,
        result: AuthAttemptAuthResult.FAILURE,
        error
      });

      throw error;
    }
  };

  /*
   * Multi factor authentication re-send code, Get user id from token
   * saved in frontend
   */
  const resendMfaToken = async (userId: string, requiredMfaMethod: MfaMethod) => {
    if (requiredMfaMethod !== MfaMethod.EMAIL) {
      throw new BadRequestError({
        message: "Email MFA code cannot be sent when a different MFA method is required"
      });
    }

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
    requiredMfaMethod,
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

      // Recovery codes are account-level and bypass the configured second
      // factor regardless of the required MFA method (email, TOTP or WebAuthn).
      if (isRecoveryCode) {
        await mfaRecoveryCodeService.verifyAndConsumeRecoveryCode({
          userId,
          recoveryCode: mfaToken
        });
      } else if (mfaMethod !== requiredMfaMethod) {
        throw new BadRequestError({
          message: `Invalid MFA method. ${requiredMfaMethod} verification is required.`
        });
      } else if (mfaMethod === MfaMethod.EMAIL) {
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_MFA,
          userId,
          code: mfaToken
        });
      } else if (mfaMethod === MfaMethod.TOTP) {
        if (mfaToken.length !== 6) {
          throw new BadRequestError({
            message: "Please use a valid TOTP code."
          });
        }
        await totpService.verifyUserTotp({
          userId,
          totp: mfaToken
        });
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
      if (isRecoveryCode && err instanceof NotFoundError) {
        throw new BadRequestError({
          message: "No recovery codes are configured for this account. Please use another MFA method."
        });
      }

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
              await keyStore.setItemWithExpiry(
                KeyStorePrefixes.UserMfaUnlockEmailSent(userId),
                KeyStoreTtls.UserMfaUnlockEmailSentInSeconds,
                "1"
              );
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

    if (isRecoveryCode && userEnc.email) {
      await smtpService
        .sendMail({
          template: SmtpTemplates.MfaRecoveryCodeUsed,
          subjectLine: "A recovery code was used to sign in to your Infisical account",
          recipients: [userEnc.email],
          substitutions: {
            email: userEnc.email,
            timestamp: new Date().toString(),
            ip,
            userAgent
          }
        })
        .catch((err) => logger.error(err, "Failed to send MFA recovery code used email"));
    }

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
    isEmailVerifiedByProvider,
    ip,
    userAgent
  }: TOauthLoginDTO) => {
    const aliasType = authMethodToAliasType(authMethod);
    const sanitizedEmail = sanitizeEmail(email);
    validateEmail(sanitizedEmail);

    // Step 1: Look up user by provider alias (stable, immutable ID)
    let user: TUsers | undefined;
    let isNewAlias = false;
    let existingAlias = await userAliasDAL.findOne({ externalId: providerUserId, aliasType });
    if (existingAlias) {
      user = await userDAL.findById(existingAlias.userId);
    }

    // Step 2: Fall back to email lookup for existing users without an alias yet
    if (!user) {
      user = await userDAL.findOne({ username: sanitizedEmail });
      if (user) {
        isNewAlias = true;
      }
    }

    // Captured before any mutation so we can tell whether this login is what completed the
    // user's signup (used by the caller to fire signup telemetry exactly once per account).
    const wasUserAcceptedBeforeLogin = Boolean(user?.isAccepted);

    // Mirror complete-account's invite detection: a not-yet-accepted user who already has an org
    // membership was invited (the inviter created it), versus an organic signup that has none yet.
    // Only meaningful when this login completes the signup, so skip the read for accepted users.
    const wasInvited =
      !wasUserAcceptedBeforeLogin && user
        ? (await orgDAL.findMembership({ actorUserId: user.id, scope: AccessScope.Organization })).length > 0
        : false;

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
            username: sanitizedEmail,
            email: sanitizedEmail,
            // when the provider already verified the email we skip our own verification step
            // and complete the signup immediately (same as the SAML/OIDC enforced flow)
            isEmailVerified: isEmailVerifiedByProvider,
            isAccepted: isEmailVerifiedByProvider,
            ...(authMethod === AuthMethod.GOOGLE && { isGoogleVerified: isEmailVerifiedByProvider }),
            ...(authMethod === AuthMethod.GITHUB && { isGitHubVerified: isEmailVerifiedByProvider }),
            ...(authMethod === AuthMethod.GITLAB && { isGitLabVerified: isEmailVerifiedByProvider }),
            firstName,
            lastName,
            authMethods: [authMethod],
            isGhost: false
          },
          tx
        );

        if (authMethod === AuthMethod.GITHUB && serverCfg.defaultAuthOrgId && !appCfg.isCloud) {
          const defaultOrg = await requestMemoize(requestMemoKeys.orgFindOrgById(serverCfg.defaultAuthOrgId), () =>
            orgDAL.findOrgById(serverCfg.defaultAuthOrgId as string)
          );
          if (!defaultOrg) {
            throw new BadRequestError({
              message: `Failed to find default organization with ID ${serverCfg.defaultAuthOrgId}`
            });
          }
          orgId = defaultOrg.id;
          const existingMembership = await membershipUserDAL.findOne({
            actorUserId: newUser.id,
            scopeOrgId: orgId,
            scope: AccessScope.Organization
          });

          if (!existingMembership) {
            const { role, roleId } = await getDefaultOrgMembershipRole(defaultOrg.defaultMembershipRole);

            const membership = await membershipUserDAL.create(
              {
                actorUserId: newUser.id,
                inviteEmail: sanitizedEmail,
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
            emails: [sanitizedEmail],
            orgId: orgId || null,
            isEmailVerified: isEmailVerifiedByProvider
          },
          tx
        );

        return newUser;
      });
    } else {
      // Whether this login is trusted to mutate the matched account (link an auth method, overwrite
      // profile names, change the email / verified flags). The account was resolved either by a
      // stable provider alias (isNewAlias === false) or by an unverified email fallback (true):
      //  - alias match: trusted only when the alias is not stale AND control of the email is proven
      //    in this login, i.e. the alias is already verified or the provider verified the asserted
      //    email. A still-unverified alias is NOT trusted on a matching email alone: an attacker can
      //    plant such an alias (email-fallback backfill) under their own externalId for the victim's
      //    email, and knowing the email is not proof of owning it. (Stale = still-unverified and the
      //    asserted email matches none of the account's known emails; even a provider-verified email
      //    proves only that the caller owns *that* email, not the aliased account, so a stale alias
      //    must never mutate it.)
      //  - email-fallback match: the asserted email IS the account's username, so trust it only when
      //    the provider verified that email; an unverified assertion doesn't prove control of it.
      const isTrustedForAccount =
        existingAlias && !isNewAlias
          ? !isStaleSsoAlias({ user, userAlias: existingAlias, assertedEmail: sanitizedEmail }) &&
            (existingAlias.isEmailVerified || isEmailVerifiedByProvider)
          : isEmailVerifiedByProvider;

      const isLinkingRequired = !user?.authMethods?.includes(authMethod);
      if (isLinkingRequired && isTrustedForAccount) {
        // we update the names here because upon org invitation, the names are set to be NULL
        // if user is signing up with SSO after invitation, their names should be set based on their SSO profile
        user = await userDAL.updateById(user.id, {
          authMethods: [...(user.authMethods || []), authMethod],
          firstName,
          lastName,
          // trust the provider's verification of the email when linking a new SSO method
          ...(authMethod === AuthMethod.GOOGLE && { isGoogleVerified: isEmailVerifiedByProvider }),
          ...(authMethod === AuthMethod.GITHUB && { isGitHubVerified: isEmailVerifiedByProvider }),
          ...(authMethod === AuthMethod.GITLAB && { isGitLabVerified: isEmailVerifiedByProvider })
        });
      }

      // A provider-driven email change renames the account and marks the alias verified, so only do
      // it for a trusted login (see isTrustedForAccount above). For a stale alias this is skipped,
      // letting the stale-alias guard below decline promotion and fall through to the email-
      // verification flow (no session). With existingAlias set, isTrustedForAccount requires the
      // alias to be non-stale AND already verified or provider-verified in this login.
      if (existingAlias && user.email !== sanitizedEmail && isTrustedForAccount) {
        const conflictingUser = await userDAL.findOne({ username: sanitizedEmail });
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
              username: sanitizedEmail,
              email: sanitizedEmail,
              // the email changed at the provider: trust the provider's verification of the new
              // email for the current method, and preserve the other providers' statuses
              isGitHubVerified: authMethod === AuthMethod.GITHUB ? isEmailVerifiedByProvider : user?.isGitHubVerified,
              isGoogleVerified: authMethod === AuthMethod.GOOGLE ? isEmailVerifiedByProvider : user?.isGoogleVerified,
              isGitLabVerified: authMethod === AuthMethod.GITLAB ? isEmailVerifiedByProvider : user?.isGitLabVerified
            },
            tx
          );

          existingAlias = await userAliasDAL.updateById(
            existingAlias.id,
            {
              emails: [sanitizedEmail],
              isEmailVerified: isEmailVerifiedByProvider
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

    // Promote an as-yet-unverified alias ONLY when the provider attests the email in THIS login. The
    // account-level isXVerified flag is per account, not per provider-identity, so it must not promote
    // an unverified alias: an attacker can plant an unverified alias (email-fallback backfill) for the
    // victim's email under their own externalId, and inheriting the flag on a later login would mint a
    // session as the victim. An already-verified alias stays trusted via existingAlias.isEmailVerified.
    const isAliasVerified = isEmailVerifiedByProvider;
    // Self-healing backfill: create alias for existing users found by email fallback
    if (isNewAlias) {
      try {
        existingAlias = await userAliasDAL.create({
          userId: user.id,
          aliasType,
          externalId: providerUserId,
          emails: [sanitizedEmail],
          isEmailVerified: isAliasVerified
        });
      } catch (err) {
        // Duplicate key error from the unique index (race condition: concurrent login already
        // created the alias), so recover the existing row instead
        if (err instanceof DatabaseError && (err.error as { code: string })?.code === "23505") {
          logger.warn(`OAuth alias backfill for user ${user.id} skipped: alias already exists`);
          const recoveredAlias = await userAliasDAL.findOne({ externalId: providerUserId, aliasType });
          if (!recoveredAlias || recoveredAlias.userId !== user.id) {
            throw new BadRequestError({ message: "Unable to complete login; please retry.", name: "Oauth 2 login" });
          }
          existingAlias = recoveredAlias;
        } else {
          throw err;
        }
      }
    }

    // Provider attested the email (or it was verified previously): promote the user + alias to
    // verified/accepted so a real session is issued, exactly like the SAML/OIDC enforced flow.
    // The alias.isEmailVerified term also heals the legacy "alias verified but user never
    // accepted" state, which would otherwise dead-end (no code is ever issued for it below).
    if (existingAlias && (isAliasVerified || existingAlias.isEmailVerified)) {
      ({ user, userAlias: existingAlias } = await ensureSsoAccountVerified({
        user,
        userAlias: existingAlias,
        assertedEmail: sanitizedEmail,
        userDAL,
        userAliasDAL
      }));
    }

    // Send verification email for OAuth providers that haven't verified the user's email
    if (user.email && existingAlias && !existingAlias.isEmailVerified) {
      const verificationCode = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id,
        aliasId: existingAlias.id
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: `Infisical confirmation code: ${verificationCode}`,
        recipients: [user.email],
        substitutions: {
          code: verificationCode
        }
      });
    }

    const callbackResult = await processProviderCallback({
      user,
      authMethod,
      // alias-based on purpose: if the promotion above was declined (stale alias) we must fall
      // back to the signup/verification flow rather than mint a session off a user-level flag
      isEmailVerified: Boolean(existingAlias?.isEmailVerified),
      aliasId: existingAlias?.id,
      ip,
      userAgent,
      organizationId: orgId || undefined,
      callbackPort
    });

    // True when this login is the one that completed the account (fresh provider-verified
    // signup, resumed signup, or an invited user's first verified OAuth login); the caller
    // uses it to fire signup telemetry that complete-account would otherwise have sent.
    const didCompleteSignup = !wasUserAcceptedBeforeLogin && Boolean(user.isAccepted);

    return {
      ...callbackResult,
      user: { ...user, hashedPassword: null },
      didCompleteSignup,
      // meaningful only alongside didCompleteSignup: tags the completed signup as an invite
      wasInvited,
      authMethod,
      orgId,
      orgName
    };
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
    ipAddress,
    organizationId,
    userId,
    userAuthMethod,
    actorOrgId,
    isMfaVerified,
    mfaMethod
  }: {
    userAgent: string | undefined;
    ipAddress: string;
    organizationId: string;
    userId: string;
    userAuthMethod: AuthMethod;
    actorOrgId?: string;
    isMfaVerified?: boolean;
    mfaMethod?: MfaMethod;
  }) => {
    const cfg = getConfig();
    if (!userAgent) throw new UnauthorizedError({ name: "User-Agent header is required" });

    const user = await userDAL.findById(userId);
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

    const selectedOrg = await requestMemoize(requestMemoKeys.orgFindById(organizationId), () =>
      orgDAL.findById(organizationId)
    );
    if (!selectedOrg) {
      throw new NotFoundError({ message: `Organization with ID '${organizationId}' not found` });
    }

    const isSubOrganization = Boolean(selectedOrg.rootOrgId && selectedOrg.id !== selectedOrg.rootOrgId);

    if (!orgMembership.isActive) {
      throw new ForbiddenRequestError({ message: "User organization membership is inactive" });
    }

    let rootOrg = selectedOrg;

    if (isSubOrganization) {
      if (!selectedOrg.rootOrgId) {
        throw new BadRequestError({
          message: "Invalid sub-organization"
        });
      }

      rootOrg = await requestMemoize(requestMemoKeys.orgFindById(selectedOrg.rootOrgId), () =>
        orgDAL.findById(selectedOrg.rootOrgId as string)
      );
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

      if (!rootOrgMembership.isActive) {
        throw new ForbiddenRequestError({ message: "User organization membership is inactive" });
      }
    }

    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: user.id,
      orgId: rootOrg.id,
      actorAuthMethod: userAuthMethod,
      actorOrgId: rootOrg.id,
      scope: OrganizationActionScope.Any
    });
    const canBypassSso =
      rootOrg.bypassOrgAuthEnabled &&
      permission.can(OrgPermissionSsoActions.BypassSsoEnforcement, OrgPermissionSubjects.Sso);

    if (
      rootOrg.authEnforced &&
      !isAuthMethodSaml(userAuthMethod) &&
      userAuthMethod !== AuthMethod.OIDC &&
      userAuthMethod !== AuthMethod.LDAP &&
      !canBypassSso
    ) {
      throw new BadRequestError({
        message: "Login with the auth method required by your organization."
      });
    }

    if (rootOrg.googleSsoAuthEnforced && userAuthMethod !== AuthMethod.GOOGLE) {
      if (!canBypassSso) {
        throw new ForbiddenRequestError({
          message: "Google SSO is enforced for this organization. Please use Google SSO to login.",
          error: "GoogleSsoEnforced"
        });
      }
    }

    if (userAuthMethod === AuthMethod.GOOGLE) {
      await orgDAL.updateById(rootOrg.id, {
        googleSsoAuthLastUsed: new Date()
      });
    }

    if (!isSubOrganization && orgMembership.status !== OrgMembershipStatus.Accepted) {
      // Promote any Invited memberships to Accepted now that the user has authenticated into this org
      await membershipUserDAL.update(
        {
          actorUserId: user.id,
          scopeOrgId: organizationId,
          scope: AccessScope.Organization
        },
        { status: OrgMembershipStatus.Accepted }
      );
    }

    const { isMfaRequired, requiredMfaMethod } = getRequiredMfaMethod(rootOrg, user);
    // Check if organization has changed
    const hasOrganizationChanged = actorOrgId ? actorOrgId !== rootOrg.id : false;
    // Check if MFA method has changed
    const hasMfaMethodChanged = mfaMethod !== requiredMfaMethod;
    // Trigger MFA if required and either not verified or something changed
    const shouldTriggerMfa = isMfaRequired && (!isMfaVerified || hasMfaMethodChanged || hasOrganizationChanged);

    if (shouldTriggerMfa) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const mfaToken = await issueMfaChallenge({
        userId: user.id,
        email: user.email,
        authMethod: userAuthMethod,
        requiredMfaMethod,
        organizationId: rootOrg.id,
        sendEmailCode: true
      });

      return { isMfaEnabled: true, mfa: mfaToken, mfaMethod: requiredMfaMethod } as const;
    }

    await updateUserDeviceSession(user, ipAddress, userAgent);

    const tokens = await generateUserTokens({
      authMethod: userAuthMethod,
      userId: user.id,
      userAgent,
      ip: ipAddress,
      organizationId: isSubOrganization ? rootOrg.id : organizationId,
      subOrganizationId: isSubOrganization ? organizationId : undefined,
      isMfaVerified,
      mfaMethod
    });

    // In the event of this being a break-glass request (non-saml / non-oidc / non-google, when any is enforced)
    const isAuthEnforcedBypass =
      rootOrg.authEnforced &&
      rootOrg.bypassOrgAuthEnabled &&
      !isAuthMethodSaml(userAuthMethod) &&
      userAuthMethod !== AuthMethod.OIDC &&
      userAuthMethod !== AuthMethod.LDAP &&
      userAuthMethod !== AuthMethod.GOOGLE;

    const isGoogleSsoEnforcedBypass =
      rootOrg.googleSsoAuthEnforced && rootOrg.bypassOrgAuthEnabled && userAuthMethod !== AuthMethod.GOOGLE;
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

        await smtpService
          .sendMail({
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
          })
          .catch((err) => logger.error(err, "Failed to send SSO bypass alert email"));
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
          authMethod: userAuthMethod as string
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
