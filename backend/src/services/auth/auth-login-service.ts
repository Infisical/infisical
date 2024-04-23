import jwt from "jsonwebtoken";

import { TUsers, UserDeviceSchema } from "@app/db/schemas";
import { isAuthMethodSaml } from "@app/ee/services/permission/permission-fns";
import { getConfig } from "@app/lib/config/env";
import { generateSrpServerKey, srpCheckClientProof } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";

import { TTokenDALFactory } from "../auth-token/auth-token-dal";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TOrgDALFactory } from "../org/org-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { validateProviderAuthToken } from "./auth-fns";
import {
  TLoginClientProofDTO,
  TLoginGenServerPublicKeyDTO,
  TOauthLoginDTO,
  TVerifyMfaTokenDTO
} from "./auth-login-type";
import { AuthMethod, AuthModeJwtTokenPayload, AuthModeMfaJwtTokenPayload, AuthTokenType } from "./auth-type";

type TAuthLoginServiceFactoryDep = {
  userDAL: TUserDALFactory;
  orgDAL: TOrgDALFactory;
  tokenService: TAuthTokenServiceFactory;
  smtpService: TSmtpService;
  tokenDAL: TTokenDALFactory;
};

export type TAuthLoginFactory = ReturnType<typeof authLoginServiceFactory>;
export const authLoginServiceFactory = ({
  userDAL,
  tokenService,
  smtpService,
  orgDAL,
  tokenDAL
}: TAuthLoginServiceFactoryDep) => {
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
  const generateUserTokens = async ({
    user,
    ip,
    userAgent,
    organizationId,
    authMethod
  }: {
    user: TUsers;
    ip: string;
    userAgent: string;
    organizationId: string | undefined;
    authMethod: AuthMethod;
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
        authMethod,
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
        authMethod,
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
    const userEnc = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    if (!userEnc || (userEnc && !userEnc.isAccepted)) {
      throw new Error("Failed to find user");
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
    providerAuthToken
  }: TLoginClientProofDTO) => {
    const userEnc = await userDAL.findUserEncKeyByUsername({
      username: email
    });
    if (!userEnc) throw new Error("Failed to find user");
    const cfg = getConfig();

    let authMethod = AuthMethod.EMAIL;
    let organizationId: string | undefined;

    if (providerAuthToken) {
      const decodedProviderToken = validateProviderAuthToken(providerAuthToken, email);

      authMethod = decodedProviderToken.authMethod;
      if (isAuthMethodSaml(authMethod) && decodedProviderToken.orgId) {
        organizationId = decodedProviderToken.orgId;
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
    if (!isValidClientProof) throw new Error("Failed to authenticate. Try again?");

    await userDAL.updateUserEncryptionByUserId(userEnc.userId, {
      serverPrivateKey: null,
      clientPublicKey: null
    });
    // send multi factor auth token if they it enabled
    if (userEnc.isMfaEnabled && userEnc.email) {
      const mfaToken = jwt.sign(
        {
          authMethod,
          authTokenType: AuthTokenType.MFA_TOKEN,
          userId: userEnc.userId
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
      authMethod,
      organizationId
    });

    return { token, isMfaEnabled: false, user: userEnc } as const;
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
    if (!userAgent) throw new UnauthorizedError({ name: "user agent header is required" });

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

    if (!hasOrganizationMembership) {
      throw new UnauthorizedError({ message: "User does not have access to the organization" });
    }

    await tokenDAL.incrementTokenSessionVersion(user.id, decodedToken.tokenVersionId);

    const tokens = await generateUserTokens({
      authMethod: decodedToken.authMethod,
      user,
      userAgent,
      ip: ipAddress,
      organizationId
    });

    return tokens;
  };

  /*
   * Multi factor authentication re-send code, Get user id from token
   * saved in frontend
   */
  const resendMfaToken = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user || !user.email) return;
    await sendUserMfaCode({
      userId: user.id,
      email: user.email
    });
  };

  /*
   * Multi factor authentication verification of code
   * Third step of login in which user completes with mfa
   * */
  const verifyMfaToken = async ({ userId, mfaToken, mfaJwtToken, ip, userAgent, orgId }: TVerifyMfaTokenDTO) => {
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_MFA,
      userId,
      code: mfaToken
    });

    const decodedToken = jwt.verify(mfaJwtToken, getConfig().AUTH_SECRET) as AuthModeMfaJwtTokenPayload;

    const userEnc = await userDAL.findUserEncKeyByUserId(userId);
    if (!userEnc) throw new Error("Failed to authenticate user");

    const token = await generateUserTokens({
      user: {
        ...userEnc,
        id: userEnc.userId
      },
      ip,
      userAgent,
      organizationId: orgId,
      authMethod: decodedToken.authMethod
    });

    return { token, user: userEnc };
  };
  /*
   * OAuth2 login for google,github, and other oauth2 provider
   * */
  const oauth2Login = async ({ email, firstName, lastName, authMethod, callbackPort }: TOauthLoginDTO) => {
    let user = await userDAL.findUserByUsername(email);
    const serverCfg = await getServerCfg();

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
        username: email,
        email,
        firstName,
        lastName,
        authMethods: [authMethod],
        isGhost: false
      });
    }
    const isLinkingRequired = !user?.authMethods?.includes(authMethod);
    const isUserCompleted = user.isAccepted;
    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
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
    selectOrganization,
    generateUserTokens
  };
};
