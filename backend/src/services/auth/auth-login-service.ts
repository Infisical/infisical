import jwt from "jsonwebtoken";

import { TUsers, UserDeviceSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { validateProviderAuthToken } from "./auth-fns";
import {
  TLoginClientProofDTO,
  TLoginGenServerPublicKeyDTO,
  TOauthLoginDTO,
  TVerifyMfaTokenDTO
} from "./auth-login-type";
import { AuthMethod, AuthTokenType } from "./auth-type";

type TAuthLoginServiceFactoryDep = {
  userDAL: TUserDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({ userDAL, tokenService, smtpService }: TAuthLoginServiceFactoryDep) => {
  /*
   * Private
   * Not exported. This is to update user device list
   * If new device is found. Will be saved and a mail will be send
   */
  const updateUserDeviceSession = async (user: TUsers, ip: string, userAgent: string) => {
    const devices = await UserDeviceSchema.parseAsync(user.devices || []);
    const isDeviceSeen = devices.some((device) => device.ip === ip && device.userAgent === userAgent);

    if (!isDeviceSeen) {
      const newDeviceList = devices.concat([{ ip, userAgent }]);
      await userDAL.updateById(user.id, { devices: JSON.stringify(newDeviceList) });
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
  const generateUserTokens = async ({
    user,
    ip,
    userAgent,
    organizationId
  }: {
    user: TUsers;
    ip: string;
    userAgent: string;
    organizationId?: string;
  }) => {
    const cfg = getConfig();
    await updateUserDeviceSession(user, ip, userAgent);
    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: user.id
    });
    if (!tokenSession) throw new Error("Failed to create token");
    const accessToken = jwt.sign(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion,
        organizationId
      },
      cfg.AUTH_SECRET,
      { expiresIn: cfg.JWT_AUTH_LIFETIME }
    );

    const refreshToken = jwt.sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion,
        organizationId
      },
      cfg.AUTH_SECRET,
      { expiresIn: cfg.JWT_REFRESH_LIFETIME }
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
    const userEnc = await userDAL.findUserEncKeyByEmail(email);
    if (!userEnc || (userEnc && !userEnc.isAccepted)) {
      throw new Error("Failed to find  user");
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
    providerAuthToken,
    ip,
    userAgent
  }: TLoginClientProofDTO) => {
    const userEnc = await userDAL.findUserEncKeyByEmail(email);
    if (!userEnc) throw new Error("Failed to find user");
    const cfg = getConfig();

    let organizationId;
    if (!userEnc.authMethods?.includes(AuthMethod.EMAIL)) {
      const { orgId } = validateProviderAuthToken(providerAuthToken as string, email);
      organizationId = orgId;
    } else if (providerAuthToken) {
      // SAML SSO
      const { orgId } = validateProviderAuthToken(providerAuthToken, email);
      organizationId = orgId;
    }

    if (!userEnc.serverPrivateKey || !userEnc.clientPublicKey) throw new Error("Failed to authenticate. Try again?");
    const isValidClientProof = await srpCheckClientProof(
      userEnc.salt,
      userEnc.verifier,
      userEnc.serverPrivateKey,
      userEnc.clientPublicKey,
      clientProof
    );
    if (!isValidClientProof) throw new Error("Failed to authenticate. Try again?");

    await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      serverPrivateKey: null,
      clientPublicKey: null
    });
    // send multi factor auth token if they it enabled
    if (userEnc.isMfaEnabled) {
      const mfaToken = jwt.sign(
        {
          authTokenType: AuthTokenType.MFA_TOKEN,
          userId: userEnc.userId,
          organizationId
        },
        cfg.AUTH_SECRET,
        {
          expiresIn: cfg.JWT_MFA_LIFETIME
        }
      );

      await sendUserMfaCode({
        userId: userEnc.userId,
        email: userEnc.email
      });

      return { isMfaEnabled: true, token: mfaToken } as const;
    }

    const token = await generateUserTokens({
      user: {
        ...userEnc,
        id: userEnc.userId
      },
      ip,
      userAgent,
      organizationId
    });

    return { token, isMfaEnabled: false, user: userEnc } as const;
  };

  /*
   * Multi factor authentication re-send code, Get user id from token
   * saved in frontend
   */
  const resendMfaToken = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) return;
    await sendUserMfaCode({
      userId: user.id,
      email: user.email
    });
  };

  /*
   * Multi factor authentication verification of code
   * Third step of login in which user completes with mfa
   * */
  const verifyMfaToken = async ({ userId, mfaToken, ip, userAgent, orgId }: TVerifyMfaTokenDTO) => {
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId,
      code: mfaToken
    });
    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    const token = await generateUserTokens({
      user: {
        ...userEnc,
        id: userEnc.userId
      },
      ip,
      userAgent,
      organizationId: orgId
    });

    return { token, user: userEnc };
  };
  /*
   * OAuth2 login for google,github, and other oauth2 provider
   * */
  const oauth2Login = async ({
    email,
    firstName,
    lastName,
    authMethod,
    callbackPort,
    isSignupAllowed
  }: TOauthLoginDTO) => {
    let user = await userDAL.findUserByEmail(email);
    const appCfg = getConfig();
    const isOauthSignUpDisabled = !isSignupAllowed && !user;
    if (isOauthSignUpDisabled) throw new BadRequestError({ message: "User signup disabled", name: "Oauth 2 login" });

    if (!user) {
      user = await userDAL.create({ email, firstName, lastName, authMethods: [authMethod], ghost: false });
    }
    const isLinkingRequired = !user?.authMethods?.includes(authMethod);
    const isUserCompleted = user.isAccepted;
    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        authMethod,
        isUserCompleted,
        isLinkingRequired,
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
    resendMfaToken,
    verifyMfaToken,
    generateUserTokens
  };
};
