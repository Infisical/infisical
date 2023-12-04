import crypto from "node:crypto";
import bcrypt from "bcrypt";
import jwt, { SignOptions } from "jsonwebtoken";

import { TToken } from "@app/db/schemas";
import { TTokenSession } from "@app/db/schemas/token-session";
import { getConfig } from "@app/lib/config/env";

import { TTokenDalFactory } from "./token-dal";
import {
  TCreateTokenForUserDTO,
  TIssueAuthTokenDTO,
  TokenType,
  TValidateTokenForUserDTO
} from "./token-types";

type TTokenServiceFactoryDep = {
  tokenDal: TTokenDalFactory;
  // adjust the expiry from env through here
};
export type TTokenServiceFactory = ReturnType<typeof tokenServiceFactory>;

export const getTokenConfig = (tokenType: TokenType) => {
  // generate random token based on specified token use-case
  // type [type]
  switch (tokenType) {
    case TokenType.TOKEN_EMAIL_CONFIRMATION: {
      // generate random 6-digit code
      const token = String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_MFA: {
      // generate random 6-digit code
      const token = String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));
      const triesLeft = 5;
      const expiresAt = new Date(new Date().getTime() + 300000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_ORG_INVITATION: {
      // generate random hex
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(new Date().getTime() + 259200000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_PASSWORD_RESET: {
      // generate random hex
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    default: {
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date();
      return { token, expiresAt };
    }
  }
};

export const tokenServiceFactory = ({ tokenDal }: TTokenServiceFactoryDep) => {
  const createTokenForUser = async ({ type, userId }: TCreateTokenForUserDTO) => {
    const { token, ...tkCfg } = getTokenConfig(type);
    const appCfg = getConfig();
    const tokenHash = await bcrypt.hash(token, appCfg.SALT_ROUNDS);
    await tokenDal.upsertTokenForUser({
      userId,
      type,
      expiresAt: tkCfg.expiresAt,
      tokenHash,
      triesLeft: tkCfg?.triesLeft
    });
    return token;
  };

  const validateTokenForUser = async ({
    type,
    userId,
    code
  }: TValidateTokenForUserDTO): Promise<TToken | undefined> => {
    const token = await tokenDal.getTokenForUser({ type, userId });
    // validate token
    if (!token) throw new Error("Failed to find token");
    if (token?.expiresAt && new Date(token.expiresAt) < new Date()) {
      await tokenDal.deleteTokenForUser({ type, userId });
      throw new Error("Token expired. Please try again");
    }

    const isValidToken = await bcrypt.compare(code, token.tokenHash);
    if (!isValidToken) {
      if (token?.triesLeft) {
        if (token.triesLeft === 1) {
          await tokenDal.deleteTokenForUser({ type, userId });
        } else {
          await tokenDal.decrementTriesField({ type, userId });
        }
      }
      throw new Error("Invalid token");
    }

    const deletedToken = await tokenDal.deleteTokenForUser({ type, userId });
    return deletedToken?.[0];
  };

  const getUserTokenSession = async ({
    userId,
    ip,
    userAgent
  }: TIssueAuthTokenDTO): Promise<TTokenSession | undefined> => {
    let session = await tokenDal.getTokenSession(userId, ip, userAgent);
    if (!session) {
      session = await tokenDal.insertTokenSession(userId, ip, userAgent);
    }
    return session;
  };

  const clearTokenSessionById = async (
    userId: string,
    sessionId: string
  ): Promise<TTokenSession | undefined> => tokenDal.incrementVersion(userId, sessionId);

  const createJwtToken = (
    payload: string | Buffer | object,
    secret: string,
    options?: SignOptions
  ) => jwt.sign(payload, secret, options);

  return {
    createTokenForUser,
    validateTokenForUser,
    createJwtToken,
    getUserTokenSession,
    clearTokenSessionById
  };
};
