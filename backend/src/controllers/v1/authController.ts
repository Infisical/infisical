import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import * as bigintConversion from "bigint-conversion";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsrp = require("jsrp");
import { LoginSRPDetail, TokenVersion, User } from "../../models";
import { clearTokens, createToken, issueAuthTokens } from "../../helpers/auth";
import { checkUserDevice } from "../../helpers/user";
import { AuthTokenType } from "../../variables";
import { BadRequestError, UnauthorizedRequestError } from "../../utils/errors";
import {
  getAuthSecret,
  getHttpsEnabled,
  getJwtAuthLifetime
} from "../../config";
import { ActorType } from "../../ee/models";
import { validateRequest } from "../../helpers/validation";
import * as reqValidator from "../../validation/auth";

declare module "jsonwebtoken" {
  export interface AuthnJwtPayload extends jwt.JwtPayload {
    authTokenType: AuthTokenType;
  }
  export interface UserIDJwtPayload extends jwt.JwtPayload {
    userId: string;
    refreshVersion?: number;
  }
  export interface ServiceRefreshTokenJwtPayload extends jwt.JwtPayload {
    serviceTokenDataId: string;
    authTokenType: string;
    tokenVersion: number;
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
    body: { email, clientPublicKey }
  } = await validateRequest(reqValidator.Login1V1, req);

  const user = await User.findOne({
    email
  }).select("+salt +verifier");

  if (!user) throw new Error("Failed to find user");

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
        { email: email },
        {
          email: email,
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
  const {
    body: { email, clientProof }
  } = await validateRequest(reqValidator.Login2V1, req);

  const user = await User.findOne({
    email
  }).select("+salt +verifier +publicKey +encryptedPrivateKey +iv +tag");

  if (!user) throw new Error("Failed to find user");

  const loginSRPDetailFromDB = await LoginSRPDetail.findOneAndDelete({ email: email });

  if (!loginSRPDetailFromDB) {
    return BadRequestError(
      Error(
        "It looks like some details from the first login are not found. Please try login one again"
      )
    );
  }

  const server = new jsrp.server();
  server.init(
    {
      salt: user.salt,
      verifier: user.verifier,
      b: loginSRPDetailFromDB.serverBInt
    },
    async () => {
      server.setClientPublicKey(loginSRPDetailFromDB.clientPublicKey);

      // compare server and client shared keys
      if (server.checkClientProof(clientProof)) {
        // issue tokens

        await checkUserDevice({
          user,
          ip: req.realIP,
          userAgent: req.headers["user-agent"] ?? ""
        });

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

        // return (access) token in response
        return res.status(200).send({
          token: tokens.token,
          publicKey: user.publicKey,
          encryptedPrivateKey: user.encryptedPrivateKey,
          iv: user.iv,
          tag: user.tag
        });
      }

      return res.status(400).send({
        message: "Failed to authenticate. Try again?"
      });
    }
  );
};

/**
 * Log out user
 * @param req
 * @param res
 * @returns
 */
export const logout = async (req: Request, res: Response) => {
  if (req.authData.actor.type === ActorType.USER && req.authData.tokenVersionId) {
    await clearTokens(req.authData.tokenVersionId);
  }

  // clear httpOnly cookie
  res.cookie("jid", "", {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: (await getHttpsEnabled()) as boolean
  });

  return res.status(200).send({
    message: "Successfully logged out."
  });
};

export const revokeAllSessions = async (req: Request, res: Response) => {
  await TokenVersion.updateMany(
    {
      user: req.user._id
    },
    {
      $inc: {
        refreshVersion: 1,
        accessVersion: 1
      }
    }
  );

  return res.status(200).send({
    message: "Successfully revoked all sessions."
  });
};

/**
 * Return user is authenticated
 * @param req
 * @param res
 * @returns
 */
export const checkAuth = async (req: Request, res: Response) => {
  return res.status(200).send({
    message: "Authenticated"
  });
};

/**
 * Return new JWT access token by first validating the refresh token
 * @param req
 * @param res
 * @returns
 */
export const getNewToken = async (req: Request, res: Response) => {

  const refreshToken = req.cookies.jid;

  if (!refreshToken)
    throw BadRequestError({
      message: "Failed to find refresh token in request cookies"
    });

  const decodedToken = <jwt.UserIDJwtPayload>jwt.verify(refreshToken, await getAuthSecret());
  
  if (decodedToken.authTokenType !== AuthTokenType.REFRESH_TOKEN) throw UnauthorizedRequestError();

  const user = await User.findOne({
    _id: decodedToken.userId
  }).select("+publicKey +refreshVersion +accessVersion");

  if (!user) throw new Error("Failed to authenticate unfound user");
  if (!user?.publicKey) throw new Error("Failed to authenticate not fully set up account");

  const tokenVersion = await TokenVersion.findById(decodedToken.tokenVersionId);

  if (!tokenVersion)
    throw UnauthorizedRequestError({
      message: "Failed to validate refresh token"
    });

  if (decodedToken.refreshVersion !== tokenVersion.refreshVersion)
    throw BadRequestError({
      message: "Failed to validate refresh token"
    });

  const token = createToken({
    payload: {
      authTokenType: AuthTokenType.ACCESS_TOKEN,
      userId: decodedToken.userId,
      tokenVersionId: tokenVersion._id.toString(),
      accessVersion: tokenVersion.refreshVersion
    },
    expiresIn: await getJwtAuthLifetime(),
    secret: await getAuthSecret()
  });

  return res.status(200).send({
    token
  });
};

export const handleAuthProviderCallback = (req: Request, res: Response) => {
  res.redirect(`/login/provider/success?token=${encodeURIComponent(req.providerAuthToken)}`);
};
