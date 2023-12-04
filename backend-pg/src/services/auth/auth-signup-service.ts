import { AuthMethod } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { isDisposableEmail } from "@app/lib/validator";

import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TTokenServiceFactory } from "../token/token-service";
import { TokenType } from "../token/token-types";
import { TAuthDalFactory } from "./auth-dal";
import { AuthTokenType, TCompleteAccountSignupDTO } from "./auth-signup-type";

type TAuthSignupDep = {
  authDal: TAuthDalFactory;
  tokenService: TTokenServiceFactory;
  smtpService: TSmtpService;
};

export type TAuthSignupFactory = ReturnType<typeof authSignupServiceFactory>;
export const authSignupServiceFactory = ({
  authDal,
  tokenService,
  smtpService
}: TAuthSignupDep) => {
  // first step of signup. create user and send email
  const beginEmailSignupProcess = async (email: string) => {
    const isEmailInvalid = await isDisposableEmail(email);
    if (isEmailInvalid) {
      throw new Error("Provided a disposable email");
    }

    let user = await authDal.getUserByEmail(email);
    if (user && user.isAccepted) {
      // TODO(akhilmhdh-pg): copy as old one. this needs to be changed due to security issues
      throw new Error("Failed to send verification code for complete account");
    }
    if (!user) {
      user = await authDal.createUser(email, { authMethods: [AuthMethod.EMAIL] });
    }
    if (!user) throw new Error("Failed to create user");

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id
    });

    await smtpService.sendMail({
      template: SmtpTemplates.EmailVerification,
      subjectLine: "Infisical confirmation code",
      recipients: [email],
      substitutions: {
        code: token
      }
    });
  };

  const verifyEmailSignup = async (email: string, code: string) => {
    const user = await authDal.getUserByEmail(email);
    if (!user || (user && user.isAccepted)) {
      // TODO(akhilmhdh): copy as old one. this needs to be changed due to security issues
      throw new Error("Failed to send verification code for complete account");
    }
    const appCfg = getConfig();
    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_CONFIRMATION,
      userId: user.id,
      code
    });

    // generate jwt token this is a temporary token
    const jwtToken = tokenService.createJwtToken(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id.toString()
      },
      appCfg.JWT_AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    return { user, token: jwtToken };
  };

  const completeEmailAccountSignup = async ({
    email,
    firstName,
    lastName,
    // providerAuthToken,
    salt,
    verifier,
    publicKey,
    protectedKey,
    protectedKeyIV,
    protectedKeyTag,
    // organizationName,
    // attributionSource,
    encryptedPrivateKey,
    encryptedPrivateKeyIV,
    encryptedPrivateKeyTag,
    ip,
    userAgent
  }: TCompleteAccountSignupDTO) => {
    const user = await authDal.getUserByEmail(email);
    if (!user || (user && user.isAccepted)) {
      throw new Error("Failed to complete account for complete user");
    }

    const updateduser = await authDal.transaction(async (tx) => {
      const us = await authDal.updateUserById(
        user.id,
        { firstName, lastName, isAccepted: true },
        tx
      );
      if (!us) throw new Error("User not found");
      const userEncKey = await authDal.upsertUserEncryptionKey(
        us.id,
        {
          salt,
          verifier,
          publicKey,
          protectedKey,
          protectedKeyIV,
          protectedKeyTag,
          encryptedPrivateKey,
          iv: encryptedPrivateKeyIV,
          tag: encryptedPrivateKeyTag
        },
        tx
      );
      return { info: us, key: userEncKey };
    });

    // TODO(akhilmhdh-pg): add default org memberships
    const tokenSession = await tokenService.getUserTokenSession({
      userAgent,
      ip,
      userId: updateduser.info.id
    });
    if (!tokenSession) throw new Error("Failed to create token");
    const appCfg = getConfig();

    const accessToken = tokenService.createJwtToken(
      {
        authTokenType: AuthTokenType.ACCESS_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        accessVersion: tokenSession.accessVersion
      },
      appCfg.JWT_AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    const refreshToken = tokenService.createJwtToken(
      {
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: updateduser.info.id,
        tokenVersionId: tokenSession.id,
        refreshVersion: tokenSession.refreshVersion
      },
      appCfg.JWT_AUTH_SECRET,
      { expiresIn: appCfg.JWT_SIGNUP_LIFETIME }
    );

    return { user: updateduser.info, accessToken, refreshToken };
  };

  return {
    beginEmailSignupProcess,
    verifyEmailSignup,
    completeEmailAccountSignup
  };
};
