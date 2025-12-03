import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTotpServiceFactory } from "@app/services/totp/totp-service";

import { MfaSessionStatus, TGetMfaSessionStatusDTO, TMfaSession, TVerifyMfaSessionDTO } from "./mfa-session-types";

type TMfaSessionServiceFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser" | "validateTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  totpService: Pick<TTotpServiceFactory, "verifyUserTotp" | "verifyWithUserRecoveryCode">;
};

export type TMfaSessionServiceFactory = ReturnType<typeof mfaSessionServiceFactory>;

export const mfaSessionServiceFactory = ({
  keyStore,
  tokenService,
  smtpService,
  totpService
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

  // Helper function to update MFA session in Redis
  const updateMfaSession = async (mfaSession: TMfaSession, ttlSeconds: number): Promise<void> => {
    const mfaSessionKey = KeyStorePrefixes.MfaSession(mfaSession.sessionId);
    await keyStore.setItemWithExpiry(mfaSessionKey, ttlSeconds, JSON.stringify(mfaSession));
  };

  // Helper function to send MFA code via email
  const sendMfaCode = async (userId: string, email: string) => {
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

    // Verify the session belongs to the current user
    if (mfaSession.userId !== userId) {
      throw new ForbiddenRequestError({
        message: "MFA session does not belong to current user"
      });
    }

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
      throw new BadRequestError({
        message: "Invalid MFA code"
      });
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

  return {
    createMfaSession,
    verifyMfaSession,
    getMfaSessionStatus,
    sendMfaCode,
    getMfaSession,
    deleteMfaSession
  };
};
