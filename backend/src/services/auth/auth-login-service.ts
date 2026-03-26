import { Knex } from "knex";

import { AccessScope, OrgMembershipRole, OrgMembershipStatus, TUsers, UserDeviceSchema } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto, generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, DatabaseError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { getMinExpiresIn } from "@app/lib/fn";
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
import { TUserAuthenticationDALFactory } from "../user-authentication/user-authentication-dal";
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
  userAuthenticationDAL: Pick<
    TUserAuthenticationDALFactory,
    "findByUserId" | "findByExternalIdAndType" | "create" | "deleteById" | "updateById"
  >;
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
  userAuthenticationDAL,
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
  // ── Private helpers ──

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

  const sendUserMfaCode = async ({ userId, email }: { userId: string; email: string }) => {
    const code = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailMfa,
      subjectLine: "Infisical MFA code",
      recipients: [email],
      substitutions: { code }
    });
  };

  // ── Token generation ──

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
    const tokenSession = await tokenService.getUserTokenSession({ userAgent, ip, userId: user.id }, tx);
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

  // ── SRP Login (email/password) ──

  const loginGenServerPublicKey = async ({
    email,
    providerAuthToken,
    clientPublicKey
  }: TLoginGenServerPublicKeyDTO) => {
    const usersByUsername = await userDAL.findUserEncKeyByUsername({ username: email });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];

    if (!userEnc || !userEnc.isAccepted) {
      throw new BadRequestError({ message: "Invalid login credentials" });
    }

    if (!userEnc.salt || !userEnc.verifier) {
      throw new BadRequestError({ message: "Invalid login credentials" });
    }

    const serverCfg = await getServerCfg();

    // Server-level login method check
    if (
      serverCfg.enabledLoginMethods &&
      !serverCfg.enabledLoginMethods.includes(LoginMethod.EMAIL) &&
      !providerAuthToken
    ) {
      const userOrgs = await orgDAL.findAllOrgsByUserId(userEnc.userId);
      if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
        throw new BadRequestError({ message: "Login with email is disabled by administrator." });
      }
    }

    // Domain-based enforcement: check UserAuthentication.type
    const userAuth = await userAuthenticationDAL.findByUserId(userEnc.userId);
    if (userAuth && userAuth.type !== AuthMethod.EMAIL) {
      // User's domain requires a different auth method — only allow if they have a valid provider token
      if (!providerAuthToken) {
        throw new BadRequestError({
          message: "Invalid login credentials"
        });
      }
      validateProviderAuthToken(providerAuthToken, email);
    }

    const serverSrpKey = await generateSrpServerKey(userEnc.salt, userEnc.verifier);
    const userEncKeys = await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      clientPublicKey,
      serverPrivateKey: serverSrpKey.privateKey
    });
    if (!userEncKeys) throw new Error("Failed to update encryption key");
    return { salt: userEncKeys.salt, serverPublicKey: serverSrpKey.pubKey };
  };

  const loginExchangeClientProof = async ({
    email,
    clientProof,
    ip,
    userAgent,
    providerAuthToken,
    captchaToken,
    password
  }: TLoginClientProofDTO) => {
    const usersByUsername = await userDAL.findUserEncKeyByUsername({ username: email });
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
      await userDAL.update({ id: userEnc.userId }, { $incr: { consecutiveFailedPasswordAttempts: 1 } });
      throw new Error("Failed to authenticate. Try again?");
    }

    await userDAL.updateById(userEnc.userId, { consecutiveFailedPasswordAttempts: 0 });

    if (password) {
      const privateKey = await getUserPrivateKey(password, userEnc).catch((err) => {
        logger.error(err, `loginExchangeClientProof: private key generation failed for [userId=${user.id}]`);
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
      user: { ...userEnc, id: userEnc.userId },
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
      const usersByUsername = await userDAL.findUserEncKeyByUsername({ username: email });
      const userEnc =
        usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
      if (!userEnc) throw new BadRequestError({ message: "Invalid login credentials" });

      if (userEnc.encryptionVersion !== UserEncryption.V2) {
        throw new BadRequestError({
          message: "Legacy encryption scheme not supported",
          name: "LegacyEncryptionScheme"
        });
      }

      if (!userEnc.hashedPassword) {
        const userAuth = await userAuthenticationDAL.findByUserId(userEnc.userId);
        if (userAuth?.type === AuthMethod.EMAIL) {
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
        await userDAL.update({ id: userEnc.userId }, { $incr: { consecutiveFailedPasswordAttempts: 1 } });
        throw new BadRequestError({ message: "Invalid username or email" });
      }

      const token = await generateUserTokens({
        user: { ...userEnc, id: userEnc.userId },
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
            metadata: { email: userEnc.email, userId: userEnc.userId, username: userEnc.username, authMethod }
          },
          event: { type: EventType.USER_LOGIN, metadata: { organizationId } }
        });
      }

      return { tokens: { accessToken: token.access, refreshToken: token.refresh }, user: userEnc } as const;
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

  // ── Organization selection ──
  // Auth enforcement is now handled by UserAuthentication.type at login time.
  // This function only checks membership and MFA.

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
    authJwtToken = authJwtToken.replace("Bearer ", "");
    const decodedToken = crypto.jwt().verify(authJwtToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;
    if (!decodedToken.authMethod) throw new UnauthorizedError({ name: "Auth method not found on existing token" });

    const user = await userDAL.findUserEncKeyByUserId(decodedToken.userId);
    if (!user) throw new BadRequestError({ message: "User not found", name: "Find user from token" });

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
      throw new BadRequestError({ message: `Organization with ID '${organizationId}' not found` });
    }

    const isSubOrganization = Boolean(selectedOrg.rootOrgId && selectedOrg.id !== selectedOrg.rootOrgId);
    let rootOrg = selectedOrg;

    if (isSubOrganization) {
      if (!selectedOrg.rootOrgId) throw new BadRequestError({ message: "Invalid sub-organization" });
      rootOrg = await orgDAL.findById(selectedOrg.rootOrgId);
      if (!rootOrg) throw new BadRequestError({ message: "Invalid sub-organization" });

      const rootOrgMembership = await membershipUserDAL.findOne({
        actorUserId: user.id,
        scopeOrgId: selectedOrg.rootOrgId,
        scope: AccessScope.Organization,
        status: OrgMembershipStatus.Accepted
      });
      if (!rootOrgMembership) {
        throw new ForbiddenRequestError({ message: "User does not have access to the root organization" });
      }
    }

    // MFA check — based on user preference or org enforcement
    const shouldCheckMfa = rootOrg.enforceMfa || user.isMfaEnabled;
    const orgMfaMethod = rootOrg.enforceMfa ? (rootOrg.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const userMfaMethod = user.isMfaEnabled ? (user.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const mfaMethod = orgMfaMethod ?? userMfaMethod;

    if (shouldCheckMfa && (!decodedToken.isMfaVerified || decodedToken.mfaMethod !== mfaMethod)) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const mfaToken = crypto
        .jwt()
        .sign(
          { authMethod: decodedToken.authMethod, authTokenType: AuthTokenType.MFA_TOKEN, userId: user.id },
          cfg.AUTH_SECRET,
          { expiresIn: cfg.JWT_MFA_LIFETIME }
        );

      if (mfaMethod === MfaMethod.EMAIL && user.email) {
        await sendUserMfaCode({ userId: user.id, email: user.email });
      }

      return { isMfaEnabled: true, mfa: mfaToken, mfaMethod } as const;
    }

    await updateUserDeviceSession(user as TUsers, ipAddress, userAgent);

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

    // Audit log for sub-org selection
    if (isSubOrganization) {
      await auditLogService.createAuditLog({
        orgId: organizationId,
        ipAddress,
        userAgent,
        userAgentType: getUserAgentType(userAgent),
        actor: {
          type: ActorType.USER,
          metadata: { email: user.email, userId: user.id, username: user.username, authMethod: decodedToken.authMethod }
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
          metadata: { email: user.email, userId: user.id, username: user.username, authMethod: decodedToken.authMethod }
        },
        event: { type: EventType.USER_LOGIN, metadata: { organizationId } }
      });
    }

    return { isMfaEnabled: false, ...tokens, user } as const;
  };

  // ── MFA ──

  const processFailedMfaAttempt = async (userId: string) => {
    try {
      return await userDAL.transaction(async (tx) => {
        const PROGRESSIVE_DELAY_INTERVAL = 3;
        const user = await userDAL.updateById(userId, { $incr: { consecutiveFailedMfaAttempts: 1 } }, tx);
        if (!user) throw new Error("User not found");

        const progressiveDelaysInMins = [5, 30, 60];

        if (
          user.consecutiveFailedMfaAttempts &&
          user.consecutiveFailedMfaAttempts >= PROGRESSIVE_DELAY_INTERVAL * (progressiveDelaysInMins.length + 1)
        ) {
          return userDAL.updateById(userId, { isLocked: true, temporaryLockDateEnd: null }, tx);
        }

        if (user.consecutiveFailedMfaAttempts && user.consecutiveFailedMfaAttempts % PROGRESSIVE_DELAY_INTERVAL === 0) {
          const delayIndex = user.consecutiveFailedMfaAttempts / PROGRESSIVE_DELAY_INTERVAL - 1;
          return userDAL.updateById(
            userId,
            { temporaryLockDateEnd: new Date(new Date().getTime() + progressiveDelaysInMins[delayIndex] * 60 * 1000) },
            tx
          );
        }

        return user;
      });
    } catch (error) {
      throw new DatabaseError({ error, name: "Process failed MFA Attempt" });
    }
  };

  const resendMfaToken = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user || !user.email) return;
    enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);
    await sendUserMfaCode({ userId: user.id, email: user.email });
  };

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
        await tokenService.validateTokenForUser({ type: TokenType.TOKEN_EMAIL_MFA, userId, code: mfaToken });
      } else if (mfaMethod === MfaMethod.TOTP) {
        if (isRecoveryCode) {
          await totpService.verifyWithUserRecoveryCode({ userId, recoveryCode: mfaToken });
        } else {
          if (mfaToken.length !== 6) throw new BadRequestError({ message: "Please use a valid TOTP code." });
          await totpService.verifyUserTotp({ userId, totp: mfaToken });
        }
      } else if (mfaMethod === MfaMethod.WEBAUTHN) {
        if (!mfaToken) throw new BadRequestError({ message: "WebAuthn session token is required" });
        await tokenService.validateTokenForUser({ type: TokenType.TOKEN_WEBAUTHN_SESSION, userId, code: mfaToken });
      }
    } catch (err) {
      const updatedUser = await processFailedMfaAttempt(userId);
      if (updatedUser.isLocked && updatedUser.email) {
        let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
        try {
          lock = await keyStore.acquireLock([KeyStorePrefixes.UserMfaLockoutLock(userId)], 3000, { retryCount: 0 });
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
            await keyStore.setItemWithExpiry(KeyStorePrefixes.UserMfaUnlockEmailSent(userId), 300, "1");
          }
        } catch (lockErr) {
          if (lock) logger.error(lockErr, "Failed to send unlock email");
        } finally {
          if (lock) await lock.release();
        }
      }
      throw err;
    }

    const decodedToken = crypto.jwt().verify(mfaJwtToken, getConfig().AUTH_SECRET) as AuthModeMfaJwtTokenPayload;
    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    await userDAL.updateById(userId, { consecutiveFailedMfaAttempts: 0, temporaryLockDateEnd: null });

    const token = await generateUserTokens({
      user: { ...userEnc, id: userEnc.userId },
      ip,
      userAgent,
      organizationId: orgId,
      authMethod: decodedToken.authMethod,
      isMfaVerified: true,
      mfaMethod
    });

    return { token, user: userEnc };
  };

  // ── OAuth2 Login (Google, GitHub, GitLab) ──
  // Uses UserAuthentication table. Enforces auth type — if a user's
  // UserAuthentication.type is SSO (e.g., oidc), social login is blocked.

  const oauth2Login = async ({
    email,
    firstName,
    lastName,
    authMethod,
    callbackPort,
    orgSlug,
    providerUserId
  }: TOauthLoginDTO) => {
    // Step 1: Look up user by UserAuthentication record
    let user: TUsers | undefined;
    let isNewAuth = false;
    const existingAuth = await userAuthenticationDAL.findByExternalIdAndType(providerUserId, authMethod);
    if (existingAuth) {
      user = await userDAL.findById(existingAuth.userId);
    }

    // Step 2: Fall back to email lookup
    if (!user) {
      const usersByUsername = await userDAL.findUserByUsername(email);
      user = usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
      if (user) {
        const currentAuth = await userAuthenticationDAL.findByUserId(user.id);
        if (currentAuth && currentAuth.type !== authMethod && currentAuth.type !== AuthMethod.EMAIL) {
          throw new BadRequestError({
            message: "Unable to complete login with this method.",
            name: "Oauth 2 login"
          });
        }
        isNewAuth = true;
      }
    }

    const serverCfg = await getServerCfg();

    // Server-level login method checks
    if (serverCfg.enabledLoginMethods && user) {
      const loginMethodMap: Partial<Record<AuthMethod, LoginMethod>> = {
        [AuthMethod.GITHUB]: LoginMethod.GITHUB,
        [AuthMethod.GOOGLE]: LoginMethod.GOOGLE,
        [AuthMethod.GITLAB]: LoginMethod.GITLAB
      };
      const requiredLoginMethod = loginMethodMap[authMethod];
      if (requiredLoginMethod && !serverCfg.enabledLoginMethods.includes(requiredLoginMethod)) {
        const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
        if (!userOrgs.some((org) => org.userRole === OrgMembershipRole.Admin)) {
          throw new BadRequestError({
            message: `Login with ${authMethod} is disabled by administrator.`,
            name: "Oauth 2 login"
          });
        }
      }
    }

    const appCfg = getConfig();
    let orgId = "";
    let orgName: undefined | string;

    if (!user) {
      // Create new user
      if (!serverCfg?.allowSignUp) throw new BadRequestError({ message: "Sign up disabled", name: "Oauth 2 login" });

      if (serverCfg?.allowedSignUpDomain) {
        const domain = email.split("@")[1];
        const allowedDomains = serverCfg.allowedSignUpDomain.split(",").map((e) => e.trim());
        if (!allowedDomains.includes(domain)) {
          throw new BadRequestError({
            message: `Email with a domain (@${domain}) is not supported`,
            name: "Oauth 2 login"
          });
        }
      }

      user = await userDAL.transaction(async (tx) => {
        const newUser = await userDAL.create(
          {
            username: email.trim().toLowerCase(),
            email: email.trim().toLowerCase(),
            isEmailVerified: true,
            firstName,
            lastName,
            isGhost: false
          },
          tx
        );

        if (authMethod === AuthMethod.GITHUB && serverCfg.defaultAuthOrgId && !appCfg.isCloud) {
          const defaultOrg = await orgDAL.findOrgById(serverCfg.defaultAuthOrgId);
          if (!defaultOrg)
            throw new BadRequestError({
              message: `Failed to find default organization with ID ${serverCfg.defaultAuthOrgId}`
            });
          orgId = defaultOrg.id;

          const existingMembership = await orgDAL.findEffectiveOrgMembership({
            actorType: ActorType.USER,
            actorId: newUser.id,
            orgId,
            acceptAnyStatus: true
          });

          if (!existingMembership) {
            const { role, roleId } = await getDefaultOrgMembershipRole(defaultOrg.defaultMembershipRole);
            const membership = await membershipUserDAL.create(
              {
                actorUserId: newUser.id,
                inviteEmail: email,
                scopeOrgId: orgId,
                scope: AccessScope.Organization,
                status: OrgMembershipStatus.Accepted,
                isActive: true
              },
              tx
            );
            await membershipRoleDAL.create({ membershipId: membership.id, role, customRoleId: roleId }, tx);
          }
        }

        // Create UserAuthentication record
        await userAuthenticationDAL.create(
          { userId: newUser.id, type: authMethod, externalId: providerUserId, domain: email.split("@")[1] },
          tx
        );

        return newUser;
      });
    } else {
      // Existing user — update names if invited but not yet accepted
      if (!user.isAccepted) {
        user = await userDAL.updateById(user.id, { firstName, lastName });
      }

      // Sync email if provider email changed
      const normalizedProviderEmail = email.trim().toLowerCase();
      if (existingAuth && user.email !== normalizedProviderEmail) {
        const conflictingUsers = await userDAL.findUserByUsername(normalizedProviderEmail);
        const conflictingUser =
          conflictingUsers?.length > 1
            ? conflictingUsers.find((el) => el.username === normalizedProviderEmail)
            : conflictingUsers?.[0];

        if (conflictingUser && conflictingUser.id !== user.id) {
          throw new BadRequestError({
            message:
              "Unable to complete login: the email associated with your SSO account is already in use by another Infisical user.",
            name: "Oauth 2 login"
          });
        }

        user = await userDAL.updateById(user.id, { username: normalizedProviderEmail, email: normalizedProviderEmail });
      }
    }

    // Resolve org from slug if provided
    if (!orgId && orgSlug) {
      const org = await orgDAL.findOrgBySlug(orgSlug);
      if (org) {
        const membership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: user.id,
          orgId: org.id,
          status: OrgMembershipStatus.Accepted
        });
        if (membership?.isActive) {
          orgId = org.id;
          orgName = org.name;
        }
      }
    }

    // For existing users found by email who don't have a matching auth record:
    // If they have no auth record at all, create one (new user completing setup).
    // If they have a different auth type (e.g., email), block — they need to use
    // the explicit account linking flow (which requires password confirmation).
    if (isNewAuth) {
      const currentAuth = await userAuthenticationDAL.findByUserId(user.id);
      if (currentAuth) {
        // User has a different auth method — don't silently swap.
        // The explicit linking flow (with password confirmation) should be used instead.
        throw new BadRequestError({
          message: "Unable to complete login with this method.",
          name: "Oauth 2 login"
        });
      }
      try {
        await userAuthenticationDAL.create({
          userId: user.id,
          type: authMethod,
          externalId: providerUserId,
          domain: email.split("@")[1]
        });
      } catch (err) {
        if (err instanceof DatabaseError && (err.error as { code: string })?.code === "23505") {
          logger.warn(`OAuth auth backfill for user ${user.id} skipped: record already exists`);
        } else {
          throw err;
        }
      }
    }

    const isUserCompleted = user.isAccepted;
    const providerAuthToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        ...(orgId && orgSlug && orgName !== undefined
          ? { organizationId: orgId, organizationName: orgName, organizationSlug: orgSlug }
          : {}),
        username: user.username,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        hasExchangedPrivateKey: true,
        authMethod,
        isUserCompleted,
        ...(callbackPort ? { callbackPort } : {})
      },
      appCfg.AUTH_SECRET,
      { expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME }
    );

    return { isUserCompleted, providerAuthToken, user, orgId, orgName };
  };

  // ── OAuth2 Token Exchange ──

  const oauth2TokenExchange = async ({ userAgent, ip, providerAuthToken, email }: TOauthTokenExchangeDTO) => {
    const appCfg = getConfig();
    const decodedProviderToken = validateProviderAuthToken(providerAuthToken, email);

    const { authMethod, userName } = decodedProviderToken;
    if (!userName) throw new BadRequestError({ message: "Missing user name" });
    const organizationId =
      (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod)) &&
      decodedProviderToken.orgId
        ? decodedProviderToken.orgId
        : undefined;

    const usersByUsername = await userDAL.findUserEncKeyByUsername({ username: email });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    if (!userEnc) throw new BadRequestError({ message: "User encryption not found" });

    // MFA check
    const user = await userDAL.findById(userEnc.userId);
    const org = organizationId ? await orgDAL.findById(organizationId) : null;
    const shouldCheckMfa = org?.enforceMfa || user?.isMfaEnabled;

    if (shouldCheckMfa && organizationId) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const orgMfaMethod = org?.enforceMfa ? (org.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
      const userMfaMethod = user.isMfaEnabled ? (user.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
      const mfaMethod = orgMfaMethod ?? userMfaMethod;

      const mfaTokenJwt = crypto
        .jwt()
        .sign(
          { authMethod, authTokenType: AuthTokenType.MFA_TOKEN, userId: userEnc.userId, organizationId },
          appCfg.AUTH_SECRET,
          { expiresIn: appCfg.JWT_MFA_LIFETIME }
        );

      if (mfaMethod === MfaMethod.EMAIL && userEnc.email) {
        await sendUserMfaCode({ userId: userEnc.userId, email: userEnc.email });
      }

      return {
        token: { access: mfaTokenJwt, refresh: "" },
        isMfaEnabled: true,
        mfaMethod,
        user: userEnc,
        decodedProviderToken
      } as const;
    }

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
          metadata: { email: userEnc.email, userId: userEnc.userId, username: userEnc.username, authMethod }
        },
        event: {
          type: EventType.USER_LOGIN,
          metadata: {
            organizationId,
            ...(isAuthMethodSaml(decodedProviderToken.authMethod) && { authProvider: decodedProviderToken.authMethod })
          }
        }
      });
    }

    return { token, isMfaEnabled: false, user: userEnc, decodedProviderToken } as const;
  };

  // ── Logout ──

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
