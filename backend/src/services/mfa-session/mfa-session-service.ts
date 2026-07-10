import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";
import { TMfaLockoutServiceFactory } from "@app/services/auth/mfa-lockout-service";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTotpServiceFactory } from "@app/services/totp/totp-service";

import {
  MfaSessionStatus,
  TGetMfaSessionStatusDTO,
  TIsMfaSessionActiveDTO,
  TMfaSession,
  TVerifyMfaSessionDTO
} from "./mfa-session-types";

type TMfaSessionServiceFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  totpService: Pick<TTotpServiceFactory, "verifyUserTotp">;
  mfaLockoutService: Pick<
    TMfaLockoutServiceFactory,
    "enforceStepUpMfaLockStatus" | "handleFailedStepUpMfaAttempt" | "resetStepUpMfaLockStatus"
  >;
};

export type TMfaSessionServiceFactory = ReturnType<typeof mfaSessionServiceFactory>;

export const mfaSessionServiceFactory = ({
  keyStore,
  tokenService,
  smtpService,
  totpService,
  mfaLockoutService
}: TMfaSessionServiceFactoryDep) => {
  // Helper function to get MFA session from Redis
  const getMfaSession = async (mfaSessionId: string): Promise<TMfaSession | null> => {
    const mfaSessionKey = KeyStorePrefixes.MfaSession(mfaSessionId);
    const mfaSessionData = await keyStore.getItem(mfaSessionKey);

    if (!mfaSessionData) {
      return null;
    }

    return JSON.parse(mfaSessionData) as TMfaSession;
  };

  // Centralized guard that a step-up MFA session is authorized for a specific
  // resource: it must exist, belong to the given user, target the given
  // resourceId, and be ACTIVE. Every consumer MUST gate on this rather than
  // re-implementing the checks, so a session minted for one resource (e.g. a
  // low-value PAM account) can never be replayed against another (e.g. recovery
  // codes). verifyMfaSession only flips PENDING -> ACTIVE; the resource binding
  // is enforced here at the point of use.
  const isMfaSessionActive = async ({ mfaSessionId, userId, resourceId }: TIsMfaSessionActiveDTO): Promise<boolean> => {
    const mfaSession = await getMfaSession(mfaSessionId);
    return Boolean(
      mfaSession &&
        mfaSession.userId === userId &&
        mfaSession.resourceId === resourceId &&
        mfaSession.status === MfaSessionStatus.ACTIVE
    );
  };

  // Helper function to update MFA session in Redis
  const updateMfaSession = async (mfaSession: TMfaSession, ttlSeconds: number): Promise<void> => {
    const mfaSessionKey = KeyStorePrefixes.MfaSession(mfaSession.sessionId);
    await keyStore.setItemWithExpiry(mfaSessionKey, ttlSeconds, JSON.stringify(mfaSession));
  };

  // Sends an MFA code via email, throttled per user (mirrors the signup resend
  // cooldown) so a caller that repeatedly triggers a send - e.g. re-hitting a
  // step-up-gated endpoint - can't be used to flood the account inbox. SET NX is
  // atomic, so concurrent sends collapse onto a single slot. The already-emailed
  // code stays valid for its full TTL and is validated by userId (not by session),
  // so skipping a send inside the window doesn't break verification of a freshly
  // minted step-up session.
  const sendMfaCode = async (userId: string, email: string) => {
    const cooldownAcquired = await keyStore.setItemWithExpiryNX(
      KeyStorePrefixes.MfaCodeResendCooldown(userId),
      KeyStoreTtls.MfaCodeResendCooldownInSeconds,
      "1"
    );
    if (!cooldownAcquired) return;

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

  const verifyMfaSession = async ({ mfaSessionId, userId, mfaToken, mfaMethod }: TVerifyMfaSessionDTO) => {
    const mfaSession = await getMfaSession(mfaSessionId);

    if (!mfaSession) {
      throw new BadRequestError({
        message: "MFA session not found or expired"
      });
    }

    if (mfaSession.mfaMethod !== mfaMethod) {
      throw new BadRequestError({
        message: "MFA method does not match the session"
      });
    }

    // Verify the session belongs to the current user
    if (mfaSession.userId !== userId) {
      throw new ForbiddenRequestError({
        message: "MFA session does not belong to current user"
      });
    }

    await mfaLockoutService.enforceStepUpMfaLockStatus(userId);

    try {
      if (mfaMethod === MfaMethod.EMAIL) {
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_EMAIL_MFA,
          userId,
          code: mfaToken
        });
      } else if (mfaMethod === MfaMethod.TOTP) {
        if (mfaToken.length !== 6) {
          throw new BadRequestError({
            message: "Please use a valid TOTP code."
          });
        }
        await totpService.verifyUserTotp({
          userId,
          totp: mfaToken
        });
      } else if (mfaMethod === MfaMethod.WEBAUTHN) {
        await tokenService.validateTokenForUser({
          type: TokenType.TOKEN_WEBAUTHN_SESSION,
          userId,
          code: mfaToken
        });
      }
    } catch (error) {
      await mfaLockoutService.handleFailedStepUpMfaAttempt(userId);
      throw new BadRequestError({
        message: "Invalid MFA code"
      });
    }

    await mfaLockoutService.resetStepUpMfaLockStatus(userId);

    if (mfaMethod === MfaMethod.EMAIL) {
      await keyStore.deleteItem(KeyStorePrefixes.MfaCodeResendCooldown(userId));
    }

    mfaSession.status = MfaSessionStatus.ACTIVE;
    await updateMfaSession(mfaSession, KeyStoreTtls.MfaSessionInSeconds);

    return {
      success: true,
      message: "MFA verification successful"
    };
  };

  const getMfaSessionStatus = async ({ mfaSessionId, userId }: TGetMfaSessionStatusDTO) => {
    const mfaSession = await getMfaSession(mfaSessionId);

    if (!mfaSession) {
      throw new NotFoundError({
        message: "MFA session not found or expired"
      });
    }

    if (mfaSession.userId !== userId) {
      throw new ForbiddenRequestError({
        message: "MFA session does not belong to current user"
      });
    }

    return {
      status: mfaSession.status,
      mfaMethod: mfaSession.mfaMethod
    };
  };

  const createMfaSession = async (userId: string, resourceId: string, mfaMethod: MfaMethod): Promise<string> => {
    const mfaSessionId = crypto.randomBytes(32).toString("hex");
    const mfaSession: TMfaSession = {
      sessionId: mfaSessionId,
      userId,
      resourceId,
      status: MfaSessionStatus.PENDING,
      mfaMethod
    };

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.MfaSession(mfaSessionId),
      KeyStoreTtls.MfaSessionInSeconds,
      JSON.stringify(mfaSession)
    );

    return mfaSessionId;
  };

  const deleteMfaSession = async (mfaSessionId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.MfaSession(mfaSessionId));
  };

  // Gate step-up challenge creation on the same Redis-backed lockout that verify
  // enforces, so a locked-out user is rejected before a new session (and the client
  // popup) is minted rather than only after entering another code.
  const enforceStepUpMfaLockout = async (userId: string) => {
    await mfaLockoutService.enforceStepUpMfaLockStatus(userId);
  };

  return {
    createMfaSession,
    verifyMfaSession,
    getMfaSessionStatus,
    sendMfaCode,
    getMfaSession,
    isMfaSessionActive,
    deleteMfaSession,
    enforceStepUpMfaLockout
  };
};
