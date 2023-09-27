/* eslint-disable @typescript-eslint/no-var-requires */
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as bigintConversion from "bigint-conversion";
const jsrp = require("jsrp");
import { LoginSRPDetail, User } from "../../models";
import { createToken, issueAuthTokens, validateProviderAuthToken } from "../../helpers/auth";
import { checkUserDevice } from "../../helpers/user";
import { sendMail } from "../../helpers/nodemailer";
import { TokenService } from "../../services";
import { EELogService } from "../../ee/services";
import { BadRequestError, InternalServerError } from "../../utils/errors";
import { ACTION_LOGIN, TOKEN_EMAIL_MFA } from "../../variables";
import { getUserAgentType } from "../../utils/posthog"; // TODO: move this
import { client, getEncryptionKey, getHttpsEnabled, getJwtMfaLifetime, getJwtMfaSecret, getRootEncryptionKey } from "../../config";
import { AuthMethod, MfaMethod } from "../../models/user";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/auth";
import { verifySecretKey, verifyTotp } from "../../utils/mfa";
import { removeMfaRecoveryCodes } from "../../helpers/mfa";
import { decryptSymmetric128BitHexKeyUTF8 } from "../../utils/crypto";

declare module "jsonwebtoken" {
  export interface ProviderAuthJwtPayload extends jwt.JwtPayload {
    userId: string;
    email: string;
    authProvider: AuthMethod;
    isUserCompleted: boolean;
  }
}

/**
 * Log in user step 1: Return [salt] and [serverPublicKey] as part of step 1 of SRP protocol
 * @param req
 * @param res
 * @returns
 */
export const login1 = async (req: Request, res: Response) => {
  const {
    body: { email, clientPublicKey, providerAuthToken }
  } = await validateRequest(reqValidator.Login1V3, req);

  const user = await User.findOne({
    email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  if (!user.authMethods.includes(AuthMethod.EMAIL)) {
    await validateProviderAuthToken({
      email,
      providerAuthToken
    });
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier
    },
    async () => {
      // generate server-side public key
      const serverPublicKey = server.getPublicKey();
      await LoginSRPDetail.findOneAndReplace(
        {
          email: email
        },
        {
          email,
          userId: user.id,
          clientPublicKey: clientPublicKey,
          serverBInt: bigintConversion.bigintToBuf(server.bInt)
        },
        { upsert: true, returnNewDocument: false }
      );

      return res.status(200).send({
        serverPublicKey,
        salt: user.salt
      });
    }
  );
};

/**
 * Log in user step 2: complete step 2 of SRP protocol and return token and their (encrypted)
 * private key
 * @param req
 * @param res
 * @returns
 */
export const login2 = async (req: Request, res: Response) => {
  if (!req.headers["user-agent"])
    throw InternalServerError({ message: "User-Agent header is required" });

  const {
    body: { email, providerAuthToken, clientProof }
  } = await validateRequest(reqValidator.Login2V3, req);

  const user = await User.findOne({
    email
  }).select(
    "+salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices"
  );

  if (!user) throw new Error("Failed to find user");

  if (!user.authMethods.includes(AuthMethod.EMAIL)) {
    await validateProviderAuthToken({
      email,
      providerAuthToken
    });
  }

  const loginSRPDetail = await LoginSRPDetail.findOneAndDelete({ email: email });

  if (!loginSRPDetail) {
    return BadRequestError(Error("Failed to find login details for SRP"));
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetail.serverBInt
    },
    async () => {
      server.setClientPublicKey(loginSRPDetail.clientPublicKey);

      // compare server and client shared keys
      if (server.checkClientProof(clientProof)) {
        if (user.isMfaEnabled) {
          // case: user has MFA enabled

          // generate temporary MFA token
          const token = createToken({
            payload: {
              userId: user._id.toString()
            },
            expiresIn: await getJwtMfaLifetime(),
            secret: await getJwtMfaSecret()
          });

          // TODO: fix this so the token is only sent if email is used as the MFA method
          if(user.mfaMethods?.includes(MfaMethod.EMAIL)) {
            const code = await TokenService.createToken({
              type: TOKEN_EMAIL_MFA,
              email
            });

            // send MFA code [code] to [email]
            await sendMail({
              template: "emailMfa.handlebars",
              subjectLine: "Infisical MFA code",
              recipients: [user.email],
              substitutions: {
                code
              }
            });
          }

          return res.status(200).send({
            mfaEnabled: true,
            mfaPreference: user.mfaPreference,
            mfaMethods: user.mfaMethods,
            token,
          });
        }

        await checkUserDevice({
          user,
          ip: req.realIP,
          userAgent: req.headers["user-agent"] ?? ""
        });

        // issue tokens
        const tokens = await issueAuthTokens({
          userId: user._id,
          ip: req.realIP,
          userAgent: req.headers["user-agent"] ?? ""
        });

        // store (refresh) token in httpOnly cookie
        res.cookie("jid", tokens.refreshToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: await getHttpsEnabled()
        });

        // case: user does not have MFA enabled
        // return (access) token in response

        interface ResponseData {
          mfaEnabled: boolean;
          encryptionVersion: any;
          protectedKey?: string;
          protectedKeyIV?: string;
          protectedKeyTag?: string;
          token: string;
          publicKey?: string;
          encryptedPrivateKey?: string;
          iv?: string;
          tag?: string;
        }

        const response: ResponseData = {
          mfaEnabled: false,
          encryptionVersion: user.encryptionVersion,
          token: tokens.token,
          publicKey: user.publicKey,
          encryptedPrivateKey: user.encryptedPrivateKey,
          iv: user.iv,
          tag: user.tag
        };

        if (user?.protectedKey && user?.protectedKeyIV && user?.protectedKeyTag) {
          response.protectedKey = user.protectedKey;
          response.protectedKeyIV = user.protectedKeyIV;
          response.protectedKeyTag = user.protectedKeyTag;
        }

        const loginAction = await EELogService.createAction({
          name: ACTION_LOGIN,
          userId: user._id
        });

        loginAction &&
          (await EELogService.createLog({
            userId: user._id,
            actions: [loginAction],
            channel: getUserAgentType(req.headers["user-agent"]),
            ipAddress: req.realIP
          }));

        return res.status(200).send(response);
      }

      return res.status(400).send({
        message: "Failed to authenticate. Try again?"
      });
    }
  );
};

/**
 * Verify user-supplied TOTP from their authenticator app [userTotp] and issue JWT and refresh tokens if the
 * TOTP [userTotp] is valid
 * @param req 
 * @param res 
 */
export const verifyMfaAuthAppTotp = async (req: Request, res: Response) => {
  const {
    body: { email, userTotp }
  } = await validateRequest(reqValidator.VerifyMfaAuthAppTotpV3, req);

  const user = await User.findOne({
    email,
  }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag +salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

  if (!user) throw new Error("Login failed. No user found.")

  if (
    !user.isMfaEnabled ||
    !user.mfaMethods ||
    !user.mfaMethods.includes(MfaMethod.AUTH_APP)
  )
    throw new Error("Login failed. MFA is incorrectly configured.");

  const rootEncryptionKey = await getRootEncryptionKey();
  const encryptionKey = await getEncryptionKey();

  const ciphertext = user.authAppSecretKeyCipherText;
  const iv = user.authAppSecretKeyIV;
  const tag = user.authAppSecretKeyTag;

  if (!ciphertext || !iv || !tag) throw new Error("Login failed. Some encryption properties needed for the two-factor secret key are missing.");

  let decryptedKey;

  if (rootEncryptionKey) {
    decryptedKey = client.decryptSymmetric(
      ciphertext,
      rootEncryptionKey,
      iv,
      tag
    );
  } else if (encryptionKey) {
    decryptedKey = decryptSymmetric128BitHexKeyUTF8({
      ciphertext,
      key: encryptionKey,
      iv,
      tag
    });
  }

  if (!decryptedKey) throw new Error("Login failed. Could not decrypt two-factor secret key.");

  const isTotpCorrect = await verifyTotp({ userTotp, dbSecretKey: decryptedKey });

  if (!isTotpCorrect) throw new Error("Login failed. Could not verify two-factor code. Please try again.");

  await LoginSRPDetail.deleteOne({ userId: user.id })

  await checkUserDevice({
    user,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // issue tokens
  const tokens = await issueAuthTokens({ 
    userId: user._id,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // store (refresh) token in httpOnly cookie
  res.cookie("jid", tokens.refreshToken, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: await getHttpsEnabled(),
  });

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  const resObj: VerifyMfaTokenRes = {
    encryptionVersion: user.encryptionVersion,
    token: tokens.token,
    publicKey: user.publicKey as string,
    encryptedPrivateKey: user.encryptedPrivateKey as string,
    iv: user.iv as string,
    tag: user.tag as string,
  }

  if (user?.protectedKey && user?.protectedKeyIV && user?.protectedKeyTag) {
    resObj.protectedKey = user.protectedKey;
    resObj.protectedKeyIV = user.protectedKeyIV;
    resObj.protectedKeyTag = user.protectedKeyTag;
  }

  const loginAction = await EELogService.createAction({
    name: ACTION_LOGIN,
    userId: user._id,
  });

  loginAction && await EELogService.createLog({
    userId: user._id,
    actions: [loginAction],
    channel: getUserAgentType(req.headers["user-agent"]),
    ipAddress: req.realIP,
  });

  return res.status(200).send(resObj);
};

/**
 * Verify user-supplied secret key from their authenticator app/password manager etc [userSecretKey] and issue JWT
 * and refresh tokens if the secret key [userSecretKey] is valid
 * @param req 
 * @param res 
 */
export const verifyMfaAuthAppSecretKey = async (req: Request, res: Response) => {
  const {
    body: { email, userSecretKey }
  } = await validateRequest(reqValidator.VerifyMfaAuthAppSecretKeyV3, req);

  const user = await User.findOne({
    email,
  }).select("+authAppSecretKeyCipherText +authAppSecretKeyIV +authAppSecretKeyTag +salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

  if (!user) throw new Error("Login failed. No user found.")

  if (
    !user.isMfaEnabled ||
    !user.mfaMethods ||
    !user.mfaMethods.includes(MfaMethod.AUTH_APP)
  )
    throw new Error("Login failed. MFA is incorrectly configured.");

  const rootEncryptionKey = await getRootEncryptionKey();
  const encryptionKey = await getEncryptionKey();

  const ciphertext = user.authAppSecretKeyCipherText;
  const iv = user.authAppSecretKeyIV;
  const tag = user.authAppSecretKeyTag;

  if (!ciphertext || !iv || !tag) throw new Error("Login failed. Some encryption properties needed for the two-factor secret key are missing.");

  let decryptedKey;

  if (rootEncryptionKey) {
    decryptedKey = client.decryptSymmetric(
      ciphertext,
      rootEncryptionKey,
      iv,
      tag
    );
  } else if (encryptionKey) {
    decryptedKey = decryptSymmetric128BitHexKeyUTF8({
      ciphertext,
      key: encryptionKey,
      iv,
      tag
    });
  }

  if (!decryptedKey) throw new Error("Login failed. Could not decrypt two-factor secret key.");

  const isSecretKeyCorrect = await verifySecretKey({ userSecretKey, dbSecretKey: decryptedKey });
 
  if (!isSecretKeyCorrect) throw new Error("Login failed. Could not verify two-factor secret key. Please try again.");

  await LoginSRPDetail.deleteOne({ userId: user.id })

  await checkUserDevice({
    user,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // issue tokens
  const tokens = await issueAuthTokens({ 
    userId: user._id,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // store (refresh) token in httpOnly cookie
  res.cookie("jid", tokens.refreshToken, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: await getHttpsEnabled(),
  });

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  const resObj: VerifyMfaTokenRes = {
    encryptionVersion: user.encryptionVersion,
    token: tokens.token,
    publicKey: user.publicKey as string,
    encryptedPrivateKey: user.encryptedPrivateKey as string,
    iv: user.iv as string,
    tag: user.tag as string,
  }

  if (user?.protectedKey && user?.protectedKeyIV && user?.protectedKeyTag) {
    resObj.protectedKey = user.protectedKey;
    resObj.protectedKeyIV = user.protectedKeyIV;
    resObj.protectedKeyTag = user.protectedKeyTag;
  }

  const loginAction = await EELogService.createAction({
    name: ACTION_LOGIN,
    userId: user._id,
  });

  loginAction && await EELogService.createLog({
    userId: user._id,
    actions: [loginAction],
    channel: getUserAgentType(req.headers["user-agent"]),
    ipAddress: req.realIP,
  });

  return res.status(200).send(resObj);
};

/**
 * Generate backup codes (specific to MFA) - prevents user being locked out of their account
 * @param req 
 * @param res 
 */
export const verifyMfaRecoveryCode = async (req: Request, res: Response) => {
  const {
    body: { email, userRecoveryCode }
  } = await validateRequest(reqValidator.VerifyMfaRecoveryCodeV3, req);

  const user = await User.findOne({
    email,
  }).select("+mfaRecoveryCodesCipherText +mfaRecoveryCodesIV +mfaRecoveryCodesTag +salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

  if (!user) throw new Error("Login failed. No user found.")

  if (
    !user.isMfaEnabled ||
    !user.mfaMethods ||
    !user.mfaMethods.includes(MfaMethod.MFA_RECOVERY_CODES) ||
    !user.mfaRecoveryCodesCount
  )
    throw new Error("Login failed. MFA is incorrectly configured.");

  const rootEncryptionKey = await getRootEncryptionKey();
  const encryptionKey = await getEncryptionKey();

  const ciphertextArr = user.mfaRecoveryCodesCipherText;
  const ivArr = user.mfaRecoveryCodesIV;
  const tagArr = user.mfaRecoveryCodesTag;

  if (!ciphertextArr || !ivArr || !tagArr) throw new Error("Login failed. Some encryption properties needed for the MFA recovery codes are missing.");

  if (
    ciphertextArr.length !== ivArr.length ||
    ciphertextArr.length !== tagArr.length
  )
    throw new Error("Login failed. Encryption array lengths for the MFA recovery codes do not match.");
 
  const mfaRecoveryCodes: string[] = [];
  const decryptedCodes: string[] = [];

  for (let i = 0; i < ciphertextArr.length; i++) {
    let decryptedCode; 

    if (rootEncryptionKey) {
      decryptedCode = client.decryptSymmetric(
        ciphertextArr[i],
        rootEncryptionKey,
        ivArr[i],
        tagArr[i]
      );
    } else if (encryptionKey) {
      decryptedCode = decryptSymmetric128BitHexKeyUTF8({
        ciphertext: ciphertextArr[i],
        key: encryptionKey,
        iv: ivArr[i],
        tag: tagArr[i]
      });
    }

    if (!decryptedCode) throw new Error("Login failed. Could not decrypt MFA recovery code.");

    decryptedCodes.push(decryptedCode);
  }

  mfaRecoveryCodes.push(...decryptedCodes);

  const index = mfaRecoveryCodes.indexOf(userRecoveryCode);
  const isMatch = index !== -1;

  if (!isMatch) throw new Error("Login failed. Could not verify MFA recovery code. Please try again.");

  // remove the MFA recovery code so it cannot be re-used
  ciphertextArr.splice(index, 1);
  ivArr.splice(index, 1);
  tagArr.splice(index, 1);

  // decrement the count to notify the user via email & display to the frontend
  const remainingCodes = user.mfaRecoveryCodesCount[0].currentCount -= 1;

  // if no codes are left, remove all properties associated with the MFA recovery codes
  if (remainingCodes === 0) {
    removeMfaRecoveryCodes(user);
  }

  await user.save();
    
  // notify the user that an MFA recovery code was used to access their account (and how many active codes remain)
  // Also lets the user know how to proceed if they did not do this action
  await sendMail({
    template: "mfaRecoveryCodeUsed.handlebars",
    subjectLine: "[Infisical] An MFA recovery code was used to access your account",
    recipients: [email],
    substitutions: {
      numberOfCodesLeft: remainingCodes,
    }
  });

  await LoginSRPDetail.deleteOne({ userId: user.id })

  await checkUserDevice({
    user,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // issue tokens
  const tokens = await issueAuthTokens({ 
    userId: user._id,
    ip: req.realIP,
    userAgent: req.headers["user-agent"] ?? "",
  });

  // store (refresh) token in httpOnly cookie
  res.cookie("jid", tokens.refreshToken, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: await getHttpsEnabled(),
  });

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  interface VerifyMfaTokenRes {
    encryptionVersion: number;
    protectedKey?: string;
    protectedKeyIV?: string;
    protectedKeyTag?: string;
    token: string;
    publicKey: string;
    encryptedPrivateKey: string;
    iv: string;
    tag: string;
  }

  const resObj: VerifyMfaTokenRes = {
    encryptionVersion: user.encryptionVersion,
    token: tokens.token,
    publicKey: user.publicKey as string,
    encryptedPrivateKey: user.encryptedPrivateKey as string,
    iv: user.iv as string,
    tag: user.tag as string,
  }

  if (user?.protectedKey && user?.protectedKeyIV && user?.protectedKeyTag) {
    resObj.protectedKey = user.protectedKey;
    resObj.protectedKeyIV = user.protectedKeyIV;
    resObj.protectedKeyTag = user.protectedKeyTag;
  }

  const loginAction = await EELogService.createAction({
    name: ACTION_LOGIN,
    userId: user._id,
  });

  loginAction && await EELogService.createLog({
    userId: user._id,
    actions: [loginAction],
    channel: getUserAgentType(req.headers["user-agent"]),
    ipAddress: req.realIP,
  });

  return res.status(200).send(resObj);
  
};