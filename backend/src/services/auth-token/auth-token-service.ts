import { Knex } from "knex";

import { AccessScope, TAuthTokens, TAuthTokenSessions } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";

import { AuthModeJwtTokenPayload, AuthModeRefreshJwtTokenPayload, AuthTokenType } from "../auth/auth-type";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TTokenDALFactory } from "./auth-token-dal";
import { TCreateTokenForUserDTO, TIssueAuthTokenDTO, TokenType, TValidateTokenForUserDTO } from "./auth-token-types";

type TAuthTokenServiceFactoryDep = {
  tokenDAL: TTokenDALFactory;
  userDAL: Pick<TUserDALFactory, "findById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findOne">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "findOne">;
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
    case TokenType.TOKEN_EMAIL_VERIFICATION: {
      // generate random 6-digit code
      const token = String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));
      const triesLeft = 3;
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_CHANGE_OTP: {
      const token = String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));
      const triesLeft = 1;
      const expiresAt = new Date(new Date().getTime() + 600000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_MFA: {
      // generate random 6-digit code
      const token = String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));
      const triesLeft = 3;
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
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_PASSWORD_SETUP: {
      // generate random hex
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_USER_UNLOCK: {
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date(new Date().getTime() + 259200000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_WEBAUTHN_SESSION: {
      // generate random hex token for WebAuthn session
      const token = crypto.randomBytes(32).toString("hex");
      const triesLeft = 1;
      const expiresAt = new Date(new Date().getTime() + 60000); // 60 seconds
      return { token, triesLeft, expiresAt };
    }
    default: {
      const token = crypto.randomBytes(16).toString("hex");
      const expiresAt = new Date();
      return { token, expiresAt };
    }
  }
};

export const tokenServiceFactory = ({ tokenDAL, userDAL, membershipUserDAL, orgDAL }: TAuthTokenServiceFactoryDep) => {
  const createTokenForUser = async ({ type, userId, orgId, aliasId, payload }: TCreateTokenForUserDTO) => {
    const { token, ...tkCfg } = getTokenConfig(type);
    const appCfg = getConfig();
    const tokenHash = await crypto.hashing().createHash(token, appCfg.SALT_ROUNDS);
    await tokenDAL.transaction(async (tx) => {
      await tokenDAL.delete({ userId, type, orgId: orgId || null }, tx);
      const newToken = await tokenDAL.create(
        {
          tokenHash,
          expiresAt: tkCfg.expiresAt,
          type,
          userId,
          orgId,
          triesLeft: tkCfg?.triesLeft,
          aliasId,
          payload
        },
        tx
      );
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
    const token = await tokenDAL.findOne({ type, userId, orgId: orgId || null });
    // validate token
    if (!token) throw new Error("Failed to find token");
    if (token?.expiresAt && new Date(token.expiresAt) < new Date()) {
      await tokenDAL.delete({ type, userId, orgId });
      throw new Error("Token expired. Please try again");
    }

    const isValidToken = await crypto.hashing().compareHash(code, token.tokenHash);
    if (!isValidToken) {
      if (token?.triesLeft) {
        if (token.triesLeft === 1) {
          await tokenDAL.deleteTokenForUser({ type, userId, orgId: orgId || null });
        } else {
          await tokenDAL.decrementTriesField({ type, userId, orgId: orgId || null });
        }
      }
      throw new Error("Invalid token");
    }

    const deletedToken = await tokenDAL.delete({ type, userId, orgId: orgId || null });
    return deletedToken?.[0];
  };

  const getUserTokenSession = async (
    { userId, ip, userAgent }: TIssueAuthTokenDTO,
    tx?: Knex
  ): Promise<TAuthTokenSessions | undefined> => {
    let session = await tokenDAL.findOneTokenSession({ userId, ip, userAgent }, tx);
    if (!session) {
      session = await tokenDAL.insertTokenSession(userId, ip, userAgent, tx);
    }
    return session;
  };

  const clearTokenSessionById = async (userId: string, sessionId: string): Promise<TAuthTokenSessions | undefined> =>
    tokenDAL.incrementTokenSessionVersion(userId, sessionId);

  const getUserTokenSessionById = async (id: string, userId: string) => tokenDAL.findOneTokenSession({ id, userId });

  const getTokenSessionByUser = async (userId: string) => tokenDAL.findTokenSessions({ userId });

  const revokeAllMySessions = async (userId: string) => tokenDAL.deleteTokenSession({ userId });

  const revokeMySessionById = async (userId: string, sessionId: string) =>
    tokenDAL.deleteTokenSession({ userId, id: sessionId });

  const validateRefreshToken = async (refreshToken?: string) => {
    const appCfg = getConfig();
    if (!refreshToken)
      throw new NotFoundError({
        name: "AuthTokenNotFound",
        message: "Failed to find refresh token"
      });

    const decodedToken = crypto.jwt().verify(refreshToken, appCfg.AUTH_SECRET) as AuthModeRefreshJwtTokenPayload;

    if (decodedToken.authTokenType !== AuthTokenType.REFRESH_TOKEN)
      throw new UnauthorizedError({
        message: "The token provided is not a refresh token",
        name: "InvalidToken"
      });

    const tokenVersion = await getUserTokenSessionById(decodedToken.tokenVersionId, decodedToken.userId);

    if (!tokenVersion)
      throw new UnauthorizedError({
        message: "Valid token version not found",
        name: "InvalidToken"
      });

    if (decodedToken.refreshVersion !== tokenVersion.refreshVersion) {
      throw new UnauthorizedError({
        message: "Token version mismatch",
        name: "InvalidToken"
      });
    }

    return { decodedToken, tokenVersion };
  };

  // to parse jwt identity in inject identity plugin
  const fnValidateJwtIdentity = async (token: AuthModeJwtTokenPayload) => {
    const session = await tokenDAL.findOneTokenSession({
      id: token.tokenVersionId,
      userId: token.userId
    });
    if (!session) throw new NotFoundError({ name: "Session not found" });
    if (token.accessVersion !== session.accessVersion) {
      throw new UnauthorizedError({ name: "StaleSession", message: "User session is stale, please re-authenticate" });
    }

    const user = await userDAL.findById(session.userId);
    if (!user || !user.isAccepted) throw new NotFoundError({ message: `User with ID '${session.userId}' not found` });

    let orgId = "";
    let orgName = "";
    let rootOrgId = "";
    let parentOrgId = "";
    if (token.organizationId) {
      // Check if token has sub-organization scope
      if (token.subOrganizationId) {
        const subOrganization = await orgDAL.findOne({
          id: token.subOrganizationId
        });
        if (!subOrganization)
          throw new BadRequestError({ message: `Sub organization ${token.subOrganizationId} not found` });
        // Verify the sub-org belongs to the token's root organization
        if (subOrganization.rootOrgId !== token.organizationId && subOrganization.id !== token.organizationId) {
          throw new ForbiddenRequestError({ message: "Sub-organization does not belong to the token's organization" });
        }

        const orgMembership = await membershipUserDAL.findOne({
          actorUserId: user.id,
          scopeOrgId: subOrganization.id,
          scope: AccessScope.Organization
        });

        if (!orgMembership) {
          throw new ForbiddenRequestError({ message: "User not member of organization" });
        }

        if (!orgMembership.isActive) {
          throw new ForbiddenRequestError({ message: "User organization membership is inactive" });
        }
        orgId = subOrganization.id;
        orgName = subOrganization.name;
        rootOrgId = token.organizationId;
        parentOrgId = subOrganization.parentOrgId as string;
      } else {
        const organization = await orgDAL.findOne({ id: token.organizationId });
        const orgMembership = await membershipUserDAL.findOne({
          actorUserId: user.id,
          scopeOrgId: token.organizationId,
          scope: AccessScope.Organization
        });

        if (!orgMembership) {
          throw new ForbiddenRequestError({ message: "User not member of organization" });
        }

        if (!orgMembership.isActive) {
          throw new ForbiddenRequestError({ message: "User organization membership is inactive" });
        }

        orgId = token.organizationId;
        orgName = organization.name;
        rootOrgId = token.organizationId;
        parentOrgId = token.organizationId;
      }
    }

    return { user, tokenVersionId: token.tokenVersionId, orgId, orgName, rootOrgId, parentOrgId };
  };

  return {
    createTokenForUser,
    validateTokenForUser,
    getUserTokenSession,
    clearTokenSessionById,
    getTokenSessionByUser,
    revokeAllMySessions,
    revokeMySessionById,
    validateRefreshToken,
    fnValidateJwtIdentity,
    getUserTokenSessionById
  };
};
