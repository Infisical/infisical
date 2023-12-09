import jwt from "jsonwebtoken";

import { TUsers, UserDeviceSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";

import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDalFactory } from "../user/user-dal";
import {
  TLoginClientProofDTO,
  TLoginGenServerPublicKeyDTO,
  TVerifyMfaTokenDTO
} from "./auth-login-type";
import { AuthMethod, AuthTokenType } from "./auth-type";

const isValidProviderAuthToken = (email: string, jwtSecret: string, providerAuthToken?: string) => {
  if (!providerAuthToken) return false;
  const decodedToken = jwt.verify(providerAuthToken, jwtSecret) as jwt.JwtPayload;

  if (decodedToken.authTokenType !== AuthTokenType.PROVIDER_TOKEN) return false;
  if (decodedToken.email !== email) return false;
  return true;
};

type TAuthLoginServiceFactoryDep = {
  userDal: TUserDalFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({
  userDal,
  tokenService,
  smtpService
}: TAuthLoginServiceFactoryDep) => {
  /*
   * Private
   * Not exported. This is to update user device list
   * If new device is found. Will be saved and a mail will be send
   */
  const updateUserDeviceSession = async (user: TUsers, ip: string, userAgent: string) => {
    const devices = await UserDeviceSchema.parseAsync(user.devices || []);
    const isDeviceSeen = devices.some(
      (device) => device.ip === ip && device.userAgent === userAgent
    );

    if (!isDeviceSeen) {
      const newDeviceList = devices.concat([{ ip, userAgent }]);
      await userDal.updateById(user.id, { devices: JSON.stringify(newDeviceList) });
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
  const sendUserMfaCode = async (userId: string, email: string) => {
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
  const generateUserTokens = async (user: TUsers, ip: string, userAgent: string) => {
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
        accessVersion: tokenSession.accessVersion
      },
      cfg.JWT_AUTH_SECRET,
      { expiresIn: cfg.JWT_AUTH_LIFETIME }
    );

    const refreshToken = jwt.sign(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: user.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion
      },
      cfg.JWT_AUTH_SECRET,
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
    const userEnc = await userDal.findUserEncKeyByEmail(email);
    if (!userEnc || (userEnc && !userEnc.isAccepted)) {
      throw new Error("Failed to find  user");
    }
    const cfg = getConfig();
    if (
      !userEnc.authMethods?.includes(AuthMethod.EMAIL) &&
      !isValidProviderAuthToken(email, cfg.JWT_AUTH_SECRET, providerAuthToken)
    ) {
      throw new Error("Invalid authorization request");
    }
    const serverSrpKey = await generateSrpServerKey(userEnc.salt, userEnc.verifier);
    const userEncKeys = await userDal.updateUserEncryptionByUserId(userEnc.userId, {
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
    const userEnc = await userDal.findUserEncKeyByEmail(email);
    if (!userEnc) throw new Error("Failed to find user");
    const cfg = getConfig();

    if (
      !userEnc.authMethods?.includes(AuthMethod.EMAIL) &&
      !isValidProviderAuthToken(email, cfg.JWT_AUTH_SECRET, providerAuthToken)
    ) {
      throw new Error("Invalid authorization request");
    }

    if (!userEnc.serverPrivateKey || !userEnc.clientPublicKey)
      throw new Error("Failed to authenticate. Try again?");
    const isValidClientProof = await srpCheckClientProof(
      userEnc.salt,
      userEnc.verifier,
      userEnc.serverPrivateKey,
      userEnc.clientPublicKey,
      clientProof
    );
    if (!isValidClientProof) throw new Error("Failed to authenticate. Try again?");

    await userDal.updateUserEncryptionByUserId(userEnc.userId, {
      serverPrivateKey: null,
      clientPublicKey: null
    });
    // send multi factor auth token if they it enabled
    if (userEnc.isMfaEnabled) {
      const mfaToken = jwt.sign(
        { authTokenType: AuthTokenType.MFA_TOKEN, userId: userEnc.userId },
        cfg.JWT_AUTH_SECRET,
        { expiresIn: cfg.JWT_MFA_LIFETIME }
      );
      await sendUserMfaCode(userEnc.userId, userEnc.email);

      return { isMfaEnabled: true, token: mfaToken } as const;
    }

    const token = await generateUserTokens({ ...userEnc, id: userEnc.userId }, ip, userAgent);
    return { token, isMfaEnabled: false, user: userEnc } as const;
  };

  /*
   * Multi factor authentication re-send code, Get user id from token
   * saved in frontend
   */
  const resendMfaToken = async (userId: string) => {
    const user = await userDal.findById(userId);
    if (!user) return;
    await sendUserMfaCode(user.id, user.email);
  };

  /*
   * Multi factor authentication verification of code
   * Third step of login in which user completes with mfa
   * */
  const verifyMfaToken = async ({ userId, mfaToken, ip, userAgent }: TVerifyMfaTokenDTO) => {
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId,
      code: mfaToken
    });
    const userEnc = await userDal.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    const token = await generateUserTokens({ ...userEnc, id: userEnc.userId }, ip, userAgent);
    return { token, user: userEnc };
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
    resendMfaToken,
    verifyMfaToken,
    generateUserTokens
  };
};
