import { Knex } from "knex";

import { OrgMembershipStatus, TAuthTokens, TAuthTokenSessions } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

import { ActorType, AuthModeJwtTokenPayload, AuthModeRefreshJwtTokenPayload, AuthTokenType } from "../auth/auth-type";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TTokenDALFactory } from "./auth-token-dal";
import {
  TCreateTokenForUserDTO,
  TEmailSignupOtpPayload,
  TIssueAuthTokenDTO,
  TokenType,
  TValidateTokenForUserDTO
} from "./auth-token-types";

type TAuthTokenServiceFactoryDep = {
  tokenDAL: TTokenDALFactory;
  userDAL: Pick<TUserDALFactory, "findById" | "transaction">;
  orgDAL: Pick<TOrgDALFactory, "findOne" | "findEffectiveOrgMembership">;
  membershipUserDAL: Pick<TMembershipUserDALFactory, "findOne">;
  keyStore: Pick<
    TKeyStoreFactory,
    | "setItemWithExpiry"
    | "setItemWithExpiryNX"
    | "getItem"
    | "deleteItem"
    | "acquireLock"
    | "deleteItemsByKeyIn"
    | "ttl"
  >;
};

export type TAuthTokenServiceFactory = ReturnType<typeof tokenServiceFactory>;

const generateSixDigitToken = (): string => String(crypto.randomInt(10 ** 5, 10 ** 6 - 1));

const generateRandomHex = (size: number): string => crypto.randomBytes(size).toString("hex");

const computeHash = (key: string, pepper: string): string =>
  crypto.nativeCrypto.createHmac("sha256", pepper).update(key).digest("hex");

export const getTokenConfig = (tokenType: TokenType) => {
  // generate random token based on specified token use-case
  // type [type]
  switch (tokenType) {
    case TokenType.TOKEN_EMAIL_VERIFICATION: {
      const token = generateSixDigitToken();
      const triesLeft = 3;
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_CHANGE_OTP:
    case TokenType.TOKEN_EMAIL_CHANGE_CURRENT_OTP: {
      const token = generateSixDigitToken();
      const triesLeft = 1;
      const expiresAt = new Date(new Date().getTime() + 600000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_MFA: {
      const token = generateSixDigitToken();
      const triesLeft = 3;
      const expiresAt = new Date(new Date().getTime() + 300000);
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_ORG_INVITATION: {
      const token = generateRandomHex(16);
      const expiresAt = new Date(new Date().getTime() + 259200000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_PASSWORD_RESET: {
      const token = generateRandomHex(32);
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_EMAIL_PASSWORD_SETUP: {
      const token = generateRandomHex(16);
      const expiresAt = new Date(new Date().getTime() + 86400000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_USER_UNLOCK: {
      const token = generateRandomHex(16);
      const expiresAt = new Date(new Date().getTime() + 259200000);
      return { token, expiresAt };
    }
    case TokenType.TOKEN_WEBAUTHN_SESSION: {
      const token = generateRandomHex(32);
      const triesLeft = 1;
      const expiresAt = new Date(new Date().getTime() + 60000); // 60 seconds
      return { token, triesLeft, expiresAt };
    }
    case TokenType.TOKEN_PAM_WS_TICKET: {
      const token = generateRandomHex(32);
      const triesLeft = 1;
      const expiresAt = new Date(new Date().getTime() + 30000); // 30 seconds
      return { token, triesLeft, expiresAt };
    }
    default: {
      const token = generateRandomHex(16);
      const expiresAt = new Date();
      return { token, expiresAt };
    }
  }
};

export const tokenServiceFactory = ({ tokenDAL, userDAL, orgDAL, keyStore }: TAuthTokenServiceFactoryDep) => {
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

  const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
  const validateTokenForUser = async ({
    type,
    userId,
    code,
    orgId
  }: TValidateTokenForUserDTO): Promise<TAuthTokens | undefined> => {
    const token = await tokenDAL.findOne({ type, userId, orgId: orgId || null });

    // Always perform a hash comparison, even if no token exists.
    // Use a dummy hash so the timing is indistinguishable.
    const hashToCompare = token?.tokenHash ?? DUMMY_HASH;
    const isValidToken = await crypto.hashing().compareHash(code, hashToCompare);

    // Now perform the logical checks *after* the constant-time work is done.
    if (!token) throw new Error("Invalid token");

    if (!token.expiresAt || new Date(token.expiresAt) < new Date()) {
      await tokenDAL.delete({ type, userId, orgId });
      throw new Error("Invalid token");
    }

    if (!isValidToken) {
      if (token.triesLeft !== undefined && token.triesLeft !== null) {
        if (token.triesLeft <= 1) {
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
        message: "Invalid token"
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
        message: "Invalid token",
        name: "InvalidToken"
      });

    if (decodedToken.refreshVersion !== tokenVersion.refreshVersion) {
      // Check grace period for multi-tab scenarios
      const graceKey = KeyStorePrefixes.RefreshTokenGrace(tokenVersion.id);
      const graceValue = await keyStore.getItem(graceKey);

      if (graceValue && Number(graceValue) === decodedToken.refreshVersion) {
        // Grace hit: old token used within grace window (e.g. another browser tab)
        return { decodedToken, tokenVersion, isGraceHit: true };
      }

      // Reuse detection: old token used outside grace window — potential theft
      await tokenDAL.deleteTokenSession({ id: tokenVersion.id, userId: decodedToken.userId });
      await keyStore.deleteItem(graceKey);

      throw new UnauthorizedError({
        message: "Refresh token reuse detected. Session has been revoked for security.",
        name: "TokenReuse"
      });
    }

    return { decodedToken, tokenVersion, isGraceHit: false };
  };

  const rotateRefreshToken = async (decodedToken: AuthModeRefreshJwtTokenPayload, tokenVersion: TAuthTokenSessions) => {
    const appCfg = getConfig();
    const oldRefreshVersion = tokenVersion.refreshVersion;

    // Store grace entry in Redis so the old token is still accepted briefly
    const graceKey = KeyStorePrefixes.RefreshTokenGrace(tokenVersion.id);
    await keyStore.setItemWithExpiry(graceKey, KeyStoreTtls.RefreshTokenGraceInSeconds, String(oldRefreshVersion));

    // Increment refreshVersion in DB
    const updatedSession = await tokenDAL.incrementRefreshVersion(tokenVersion.id, decodedToken.userId);
    if (!updatedSession)
      throw new UnauthorizedError({ message: "Failed to rotate refresh token", name: "RotationFailed" });

    // Determine refresh token expiry
    let refreshTokenExpiresIn: string | number = appCfg.JWT_REFRESH_LIFETIME;
    if (decodedToken.organizationId) {
      const org = await orgDAL.findOne({ id: decodedToken.organizationId });
      if (org?.userTokenExpiration) {
        refreshTokenExpiresIn = org.userTokenExpiration;
      }
    }

    // Sign new refresh token
    const newRefreshToken = crypto.jwt().sign(
      {
        authMethod: decodedToken.authMethod,
        authTokenType: AuthTokenType.REFRESH_TOKEN,
        userId: decodedToken.userId,
        tokenVersionId: updatedSession.id,
        refreshVersion: updatedSession.refreshVersion,
        organizationId: decodedToken.organizationId,
        ...(decodedToken.subOrganizationId && { subOrganizationId: decodedToken.subOrganizationId }),
        isMfaVerified: decodedToken.isMfaVerified,
        mfaMethod: decodedToken.mfaMethod
      },
      appCfg.AUTH_SECRET,
      { expiresIn: refreshTokenExpiresIn }
    );

    return { newRefreshToken, updatedSession };
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

    const user = await requestMemoize(requestMemoKeys.userFindById(session.userId), () =>
      userDAL.findById(session.userId)
    );
    if (!user || !user.isAccepted) throw new NotFoundError({ message: `User with ID '${session.userId}' not found` });

    if (user.isLocked || (user.temporaryLockDateEnd && new Date() < user.temporaryLockDateEnd)) {
      throw new UnauthorizedError({ message: "Account is locked" });
    }

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

        const orgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: user.id,
          orgId: subOrganization.id,
          status: OrgMembershipStatus.Accepted
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
        const orgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: user.id,
          orgId: token.organizationId,
          status: OrgMembershipStatus.Accepted
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

  const acquireEmailSignupCooldown = async (email: string): Promise<{ emailHash: string; cooldownSeconds: number }> => {
    const appCfg = getConfig();
    const emailHash = computeHash(email, appCfg.AUTH_SECRET);
    const cooldownKey = KeyStorePrefixes.EmailSignupResendCooldown(emailHash);
    const cooldownSeconds = KeyStoreTtls.EmailSignupResendCooldownInSeconds;

    // SET NX is atomic: only one concurrent request can acquire the cooldown slot.
    const acquired = await keyStore.setItemWithExpiryNX(cooldownKey, cooldownSeconds, "1");
    if (!acquired) {
      const remaining = await keyStore.ttl(cooldownKey);
      throw new BadRequestError({
        message: "Please wait before requesting another code",
        details: {
          cooldownSeconds: Math.max(1, remaining)
        }
      });
    }

    return {
      emailHash,
      cooldownSeconds
    };
  };

  const createEmailSignupToken = async (emailHash: string): Promise<string> => {
    const appCfg = getConfig();
    const token = generateSixDigitToken();
    const tokenHash = computeHash(token, appCfg.AUTH_SECRET);
    const ttlSeconds = KeyStoreTtls.EmailSignupOtpInSeconds;
    const payload: TEmailSignupOtpPayload = {
      tokenHash,
      triesLeft: 3,
      expiresAt: Date.now() + ttlSeconds * 1000
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.EmailSignupOtpHash(emailHash),
      ttlSeconds,
      JSON.stringify(payload)
    );

    return token;
  };

  const validateEmailSignupToken = async (email: string, code: string): Promise<void> => {
    const appCfg = getConfig();
    const emailHash = computeHash(email, appCfg.AUTH_SECRET);
    const key = KeyStorePrefixes.EmailSignupOtpHash(emailHash);

    // Acquire a short-lived lock to make the tries-decrement / delete atomic.
    const lock = await keyStore.acquireLock([KeyStorePrefixes.EmailSignupOtpLock(emailHash)], 5000);
    try {
      const computedHash = computeHash(code, appCfg.AUTH_SECRET);

      const raw = await keyStore.getItem(key);
      if (!raw) {
        // Always compute the HMAC and compare with timingSafeEqual for constant-time behaviour.
        crypto.nativeCrypto.timingSafeEqual(Buffer.from(computedHash, "hex"), Buffer.from("0".repeat(64), "hex"));
        throw new UnauthorizedError({
          message: "Invalid token",
          name: "InvalidToken"
        });
      }

      const parsed = JSON.parse(raw) as TEmailSignupOtpPayload;
      const isValidToken = crypto.nativeCrypto.timingSafeEqual(
        Buffer.from(computedHash, "hex"),
        Buffer.from(parsed.tokenHash, "hex")
      );

      if (Date.now() > parsed.expiresAt) {
        await keyStore.deleteItem(key);
        throw new UnauthorizedError({
          message: "Invalid token",
          name: "InvalidToken"
        });
      }

      if (!isValidToken) {
        const remainingTries = parsed.triesLeft - 1;
        if (remainingTries <= 0) {
          await keyStore.deleteItem(key);
        } else {
          const remainingTtlSec = Math.max(1, Math.ceil((parsed.expiresAt - Date.now()) / 1000));
          await keyStore.setItemWithExpiry(
            key,
            remainingTtlSec,
            JSON.stringify({ ...parsed, triesLeft: remainingTries })
          );
        }
        throw new UnauthorizedError({
          message: "Invalid token",
          name: "InvalidToken"
        });
      }

      const cooldownKey = KeyStorePrefixes.EmailSignupResendCooldown(emailHash);
      await keyStore.deleteItemsByKeyIn([key, cooldownKey]);
    } finally {
      await lock.release();
    }
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
    rotateRefreshToken,
    fnValidateJwtIdentity,
    getUserTokenSessionById,
    acquireEmailSignupCooldown,
    createEmailSignupToken,
    validateEmailSignupToken
  };
};
