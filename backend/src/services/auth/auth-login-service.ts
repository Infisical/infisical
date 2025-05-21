import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Knex } from "knex";

import { OrgMembershipRole, OrgMembershipStatus, TableName, TUsers, UserDeviceSchema } from "@app/db/schemas";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-service";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { request } from "@app/lib/config/request";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { infisicalSymmetricEncypt } from "@app/lib/crypto/encryption";
import { getUserPrivateKey } from "@app/lib/crypto/srp";
import { BadRequestError, DatabaseError, ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";
import { getMinExpiresIn, removeTrailingSlash } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { getDefaultOrgMembershipRole } from "../org/org-role-fns";
import { TOrgMembershipDALFactory } from "../org-membership/org-membership-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { LoginMethod } from "../super-admin/super-admin-types";
import { TTotpServiceFactory } from "../totp/totp-service";
import { TUserDALFactory } from "../user/user-dal";
import { enforceUserLockStatus, validateProviderAuthToken } from "./auth-fns";
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
  orgMembershipDAL: TOrgMembershipDALFactory;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({
  userDAL,
  tokenService,
  smtpService,
  orgDAL,
  orgMembershipDAL,
  totpService,
  auditLogService
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
      authMethod,
      isMfaVerified,
      mfaMethod
    }: {
      user: TUsers;
      ip: string;
      userAgent: string;
      organizationId?: string;
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
      if (org && org.userTokenExpiration) {
        tokenSessionExpiresIn = getMinExpiresIn(cfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
        refreshTokenExpiresIn = org.userTokenExpiration;
      }
    }

    const accessToken = jwt.sign(
      {
        authMethod,
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion,
        organizationId,
        isMfaVerified,
        mfaMethod
      },
      cfg.AUTH_SECRET,
      { expiresIn: tokenSessionExpiresIn }
    );

    const refreshToken = jwt.sign(
      {
        authMethod,
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion,
        organizationId,
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
    const appCfg = getConfig();

    // akhilmhdh: case sensitive email resolution
    const usersByUsername = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    const userEnc =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    if (!userEnc) throw new Error("Failed to find user");
    const user = await userDAL.findById(userEnc.userId);
    const cfg = getConfig();

    let authMethod = AuthMethod.EMAIL;
    let organizationId: string | undefined;

    if (providerAuthToken) {
      const decodedProviderToken = validateProviderAuthToken(providerAuthToken, email);

      authMethod = decodedProviderToken.authMethod;
      if (
        (isAuthMethodSaml(authMethod) || [AuthMethod.LDAP, AuthMethod.OIDC].includes(authMethod)) &&
        decodedProviderToken.orgId
      ) {
        organizationId = decodedProviderToken.orgId;
      }
    }

    if (
      user.consecutiveFailedPasswordAttempts &&
      user.consecutiveFailedPasswordAttempts >= 10 &&
      Boolean(appCfg.CAPTCHA_SECRET)
    ) {
      if (!captchaToken) {
        throw new BadRequestError({
          name: "Captcha Required",
          message: "Accomplish the required captcha by logging in via Web"
        });
      }

      // validate captcha token
      const response = await request.postForm<{ success: boolean }>("https://api.hcaptcha.com/siteverify", {
        response: captchaToken,
        secret: appCfg.CAPTCHA_SECRET
      });

      if (!response.data.success) {
        throw new BadRequestError({
          name: "Invalid Captcha"
        });
      }
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
      const hashedPassword = await bcrypt.hash(password, cfg.BCRYPT_SALT_ROUND);
      const { iv, tag, ciphertext, encoding } = infisicalSymmetricEncypt(privateKey);
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
    const decodedToken = jwt.verify(authJwtToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;
    if (!decodedToken.authMethod) throw new UnauthorizedError({ name: "Auth method not found on existing token" });

    const user = await userDAL.findUserEncKeyByUserId(decodedToken.userId);
    if (!user) throw new BadRequestError({ message: "User not found", name: "Find user from token" });

    // Check if the user actually has access to the specified organization.
    const userOrgs = await orgDAL.findAllOrgsByUserId(user.id);
    const hasOrganizationMembership = userOrgs.some((org) => org.id === organizationId);
    const selectedOrg = await orgDAL.findById(organizationId);

    if (!hasOrganizationMembership) {
      throw new ForbiddenRequestError({
        message: `User does not have access to the organization named ${selectedOrg?.name}`
      });
    }

    const shouldCheckMfa = selectedOrg.enforceMfa || user.isMfaEnabled;
    const orgMfaMethod = selectedOrg.enforceMfa ? (selectedOrg.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const userMfaMethod = user.isMfaEnabled ? (user.selectedMfaMethod ?? MfaMethod.EMAIL) : undefined;
    const mfaMethod = orgMfaMethod ?? userMfaMethod;

    if (shouldCheckMfa && (!decodedToken.isMfaVerified || decodedToken.mfaMethod !== mfaMethod)) {
      enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);

      const mfaToken = jwt.sign(
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
      organizationId,
      isMfaVerified: decodedToken.isMfaVerified,
      mfaMethod: decodedToken.mfaMethod
    });

    // In the event of this being a break-glass request (non-saml / non-oidc, when either is enforced)
    if (
      selectedOrg.authEnforced &&
      selectedOrg.bypassOrgAuthEnabled &&
      !isAuthMethodSaml(decodedToken.authMethod) &&
      decodedToken.authMethod !== AuthMethod.OIDC
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
        await smtpService.sendMail({
          recipients: adminEmails,
          subjectLine: "Security Alert: Admin SSO Bypass",
          substitutions: {
            email: user.email,
            timestamp: new Date().toISOString(),
            ip: ipAddress,
            userAgent,
            siteUrl: removeTrailingSlash(cfg.SITE_URL || "https://app.infisical.com")
          },
          template: SmtpTemplates.OrgAdminBreakglassAccess
        });
      }
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
    orgId
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
        if (mfaToken.length === 6) {
          await totpService.verifyUserTotp({
            userId,
            totp: mfaToken
          });
        } else {
          await totpService.verifyWithUserRecoveryCode({
            userId,
            recoveryCode: mfaToken
          });
        }
      }
    } catch (err) {
      const updatedUser = await processFailedMfaAttempt(userId);
      if (updatedUser.isLocked) {
        if (updatedUser.email) {
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
        }
      }

      throw err;
    }

    const decodedToken = jwt.verify(mfaJwtToken, getConfig().AUTH_SECRET) as AuthModeMfaJwtTokenPayload;

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
  const oauth2Login = async ({ email, firstName, lastName, authMethod, callbackPort }: TOauthLoginDTO) => {
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
        let orgId = "";
        const defaultOrg = await orgDAL.findOrgById(serverCfg.defaultAuthOrgId);
        if (!defaultOrg) {
          throw new BadRequestError({
            message: `Failed to find default organization with ID ${serverCfg.defaultAuthOrgId}`
          });
        }
        orgId = defaultOrg.id;
        const [orgMembership] = await orgDAL.findMembership({
          [`${TableName.OrgMembership}.userId` as "userId"]: user.id,
          [`${TableName.OrgMembership}.orgId` as "id"]: orgId
        });

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(defaultOrg.defaultMembershipRole);

          await orgMembershipDAL.create({
            userId: user.id,
            inviteEmail: email,
            orgId,
            role,
            roleId,
            status: OrgMembershipStatus.Accepted,
            isActive: true
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

    const userEnc = await userDAL.findUserEncKeyByUserId(user.id);
    const isUserCompleted = user.isAccepted;
    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        firstName: user.firstName,
        lastName: user.lastName,
        hasExchangedPrivateKey: Boolean(userEnc?.serverEncryptedPrivateKey),
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
    return { isUserCompleted, providerAuthToken };
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

    if (!userEnc?.serverEncryptedPrivateKey)
      throw new BadRequestError({ message: "Key handoff incomplete. Please try logging in again." });

    const token = await generateUserTokens({
      user: { ...userEnc, id: userEnc.userId },
      ip,
      userAgent,
      authMethod,
      organizationId
    });

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
    generateUserTokens
  };
};
