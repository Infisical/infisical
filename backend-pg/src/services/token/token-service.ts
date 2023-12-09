import crypto from "node:crypto";
import bcrypt from "bcrypt";

import { TAuthTokens, TAuthTokenSessions } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";

import { TTokenDalFactory } from "./token-dal";
import {
  TCreateTokenForUserDTO,
  TIssueAuthTokenDTO,
  TokenType,
  TValidateTokenForUserDTO
} from "./token-types";

type TAuthTokenServiceFactoryDep = {
  tokenDal: TTokenDalFactory;
  // adjust the expiry from env through here
};
export type TAuthTokenServiceFactory = ReturnType<typeof tokenServiceFactory>;

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

export const tokenServiceFactory = ({ tokenDal }: TAuthTokenServiceFactoryDep) => {
  const createTokenForUser = async ({ type, userId, orgId }: TCreateTokenForUserDTO) => {
    const { token, ...tkCfg } = getTokenConfig(type);
    const appCfg = getConfig();
    const tokenHash = await bcrypt.hash(token, appCfg.SALT_ROUNDS);
    await tokenDal.transaction(async (tx) => {
      await tokenDal.delete({ userId, type, orgId: orgId || null }, tx);
      const newToken = await tokenDal.create({
        tokenHash,
        expiresAt: tkCfg.expiresAt.toUTCString(),
        type,
        userId,
        orgId,
        triesLeft: tkCfg?.triesLeft
      });
      return newToken;
    });

    return token;
  };

  const validateTokenForUser = async ({
    type,
    userId,
    code,
    orgId
  }: TValidateTokenForUserDTO): Promise<TAuthTokens | undefined> => {
    const token = await tokenDal.findOne({ type, userId, orgId: orgId || null });
    // validate token
    if (!token) throw new Error("Failed to find token");
    if (token?.expiresAt && new Date(token.expiresAt) < new Date()) {
      await tokenDal.delete({ type, userId, orgId });
      throw new Error("Token expired. Please try again");
    }

    const isValidToken = await bcrypt.compare(code, token.tokenHash);
    if (!isValidToken) {
      if (token?.triesLeft) {
        if (token.triesLeft === 1) {
          await tokenDal.deleteTokenForUser({ type, userId, orgId: orgId || null });
        } else {
          await tokenDal.decrementTriesField({ type, userId, orgId: orgId || null });
        }
      }
      throw new Error("Invalid token");
    }

    const deletedToken = await tokenDal.delete({ type, userId, orgId: orgId || null });
    return deletedToken?.[0];
  };

  const getUserTokenSession = async ({
    userId,
    ip,
    userAgent
  }: TIssueAuthTokenDTO): Promise<TAuthTokenSessions | undefined> => {
    let session = await tokenDal.findOneTokenSession({ userId, ip, userAgent });
    if (!session) {
      session = await tokenDal.insertTokenSession(userId, ip, userAgent);
    }
    return session;
  };

  const getUserTokenSessionById = async (id: string, userId: string) =>
    tokenDal.findOneTokenSession({ id, userId });

  const clearTokenSessionById = async (
    userId: string,
    sessionId: string
  ): Promise<TAuthTokenSessions | undefined> =>
    tokenDal.incrementTokenSessionVersion(userId, sessionId);

  const getTokenSessionByUser = async (userId: string) => tokenDal.findTokenSessions({ userId });

  const revokeAllMySessions = async (userId: string) => tokenDal.deleteTokenSession({ userId });

  return {
    createTokenForUser,
    validateTokenForUser,
    getUserTokenSession,
    clearTokenSessionById,
    getUserTokenSessionById,
    getTokenSessionByUser,
    revokeAllMySessions
  };
};
