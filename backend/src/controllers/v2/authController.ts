/* eslint-disable @typescript-eslint/no-var-requires */
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as bigintConversion from "bigint-conversion";
const jsrp = require("jsrp");
import { LoginSRPDetail, User } from "../../models";
import { createToken, issueAuthTokens } from "../../helpers/auth";
import { checkUserDevice } from "../../helpers/user";
import { sendMail } from "../../helpers/nodemailer";
import { TokenService } from "../../services";
import { EELogService } from "../../ee/services";
import { BadRequestError, InternalServerError } from "../../utils/errors";
import {
  ACTION_LOGIN,
  TOKEN_EMAIL_MFA,
} from "../../variables";
import { getUserAgentType } from "../../utils/posthog"; // TODO: move this
import {
  getHttpsEnabled,
  getJwtMfaLifetime,
  getJwtMfaSecret,
} from "../../config";

declare module "jsonwebtoken" {
  export interface UserIDJwtPayload extends jwt.JwtPayload {
    userId: string;
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
    email,
    clientPublicKey,
  }: { email: string; clientPublicKey: string } = req.body;

  const user = await User.findOne({
    email,
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
    },
    async () => {
      // generate server-side public key
      const serverPublicKey = server.getPublicKey();

      await LoginSRPDetail.findOneAndReplace({ email: email }, {
        email: email,
        clientPublicKey: clientPublicKey,
        serverBInt: bigintConversion.bigintToBuf(server.bInt),
      }, { upsert: true, returnNewDocument: false });

      return res.status(200).send({
        serverPublicKey,
        salt: user.salt,
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
  if (!req.headers["user-agent"]) throw InternalServerError({ message: "User-Agent header is required" });

  const { email, clientProof } = req.body;
  const user = await User.findOne({
    email,
  }).select("+salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

  if (!user) throw new Error("Failed to find user");

  const loginSRPDetail = await LoginSRPDetail.findOneAndDelete({ email: email })

  if (!loginSRPDetail) {
    return BadRequestError(Error("Failed to find login details for SRP"))
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetail.serverBInt,
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
              userId: user._id.toString(),
            },
            expiresIn: await getJwtMfaLifetime(),
            secret: await getJwtMfaSecret(),
          });

          const code = await TokenService.createToken({
            type: TOKEN_EMAIL_MFA,
            email,
          });

          // send MFA code [code] to [email]
          await sendMail({
            template: "emailMfa.handlebars",
            subjectLine: "Infisical MFA code",
            recipients: [email],
            substitutions: {
              code,
            },
          });

          return res.status(200).send({
            mfaEnabled: true,
            token,
          });
        }

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
          tag: user.tag,
        }

        if (
          user?.protectedKey &&
          user?.protectedKeyIV &&
          user?.protectedKeyTag
        ) {
          response.protectedKey = user.protectedKey;
          response.protectedKeyIV = user.protectedKeyIV
          response.protectedKeyTag = user.protectedKeyTag;
        }

        const loginAction = await EELogService.createAction({
          name: ACTION_LOGIN,
          userId: user._id,
        });

        loginAction && await EELogService.createLog({
          userId: user._id,
          actions: [loginAction],
          channel: getUserAgentType(req.headers["user-agent"]),
          ipAddress: req.ip,
        });

        return res.status(200).send(response);
      }

      return res.status(400).send({
        message: "Failed to authenticate. Try again?",
      });
    }
  );
};

/**
 * Send MFA token to email [email]
 * @param req 
 * @param res 
 */
export const sendMfaToken = async (req: Request, res: Response) => {
  const { email } = req.body;

  const code = await TokenService.createToken({
    type: TOKEN_EMAIL_MFA,
    email,
  });

  // send MFA code [code] to [email]
  await sendMail({
    template: "emailMfa.handlebars",
    subjectLine: "Infisical MFA code",
    recipients: [email],
    substitutions: {
      code,
    },
  });

  return res.status(200).send({
    message: "Successfully sent new MFA code",
  });
}

/**
 * Verify MFA token [mfaToken] and issue JWT and refresh tokens if the
 * MFA token [mfaToken] is valid
 * @param req 
 * @param res 
 */
export const verifyMfaToken = async (req: Request, res: Response) => {
  const { email, mfaToken } = req.body;

  await TokenService.validateToken({
    type: TOKEN_EMAIL_MFA,
    email,
    token: mfaToken,
  });

  const user = await User.findOne({
    email,
  }).select("+salt +verifier +encryptionVersion +protectedKey +protectedKeyIV +protectedKeyTag +publicKey +encryptedPrivateKey +iv +tag +devices");

  if (!user) throw new Error("Failed to find user");

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
}
