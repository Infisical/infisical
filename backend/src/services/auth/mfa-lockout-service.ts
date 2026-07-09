import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { DatabaseError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { enforceUserLockStatus } from "./auth-fns";

const PROGRESSIVE_DELAY_INTERVAL = 5;
const PROGRESSIVE_DELAYS_IN_MINS = [5, 30, 60];

type TMfaLockoutServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "findById" | "updateById" | "transaction">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem" | "setItemWithExpiry">;
};

export type TMfaLockoutServiceFactory = ReturnType<typeof mfaLockoutServiceFactory>;

export const mfaLockoutServiceFactory = ({
  userDAL,
  tokenService,
  smtpService,
  keyStore
}: TMfaLockoutServiceFactoryDep) => {
  // Rejects the request when the user is currently locked (permanently or
  // temporarily) from MFA verification. Fetches the user itself so callers that
  // don't already hold the row can guard cheaply.
  const enforceMfaLockStatus = async (userId: string) => {
    const user = await userDAL.findById(userId);
    if (!user) return;
    enforceUserLockStatus(Boolean(user.isLocked), user.temporaryLockDateEnd);
  };

  // Increments the shared consecutive-failed-MFA counter and, on hitting a
  // progressive-delay interval, applies an escalating temporary lock; once the
  // delays are exhausted the account is permanently locked. Returns the updated
  // user so the caller can react (e.g. send an unlock email).
  const processFailedMfaAttempt = async (userId: string) => {
    try {
      const updatedUser = await userDAL.transaction(async (tx) => {
        const user = await userDAL.updateById(userId, { $incr: { consecutiveFailedMfaAttempts: 1 } }, tx);

        if (!user) {
          throw new Error("User not found");
        }

        // lock user when failed attempt exceeds threshold
        if (
          user.consecutiveFailedMfaAttempts &&
          user.consecutiveFailedMfaAttempts >= PROGRESSIVE_DELAY_INTERVAL * (PROGRESSIVE_DELAYS_IN_MINS.length + 1)
        ) {
          return userDAL.updateById(
            userId,
            {
              isLocked: true,
              temporaryLockDateEnd: null
            },
            tx
          );
        }

        // delay user only when failed MFA attempts is a multiple of configured delay interval
        if (user.consecutiveFailedMfaAttempts && user.consecutiveFailedMfaAttempts % PROGRESSIVE_DELAY_INTERVAL === 0) {
          const delayIndex = user.consecutiveFailedMfaAttempts / PROGRESSIVE_DELAY_INTERVAL - 1;
          return userDAL.updateById(
            userId,
            {
              temporaryLockDateEnd: new Date(new Date().getTime() + PROGRESSIVE_DELAYS_IN_MINS[delayIndex] * 60 * 1000)
            },
            tx
          );
        }

        return user;
      });

      return updatedUser;
    } catch (error) {
      throw new DatabaseError({ error, name: "Process failed MFA Attempt" });
    }
  };

  // Sends the account-unlock email when the user has just become permanently
  // locked, debounced (5 min) and guarded by a keystore lock so concurrent
  // failures don't fan out into duplicate emails.
  const sendMfaUnlockEmail = async (user: { id: string; email?: string | null; isLocked?: boolean | null }) => {
    if (!user.isLocked || !user.email) return;

    const appCfg = getConfig();

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
    try {
      lock = await keyStore.acquireLock([KeyStorePrefixes.UserMfaLockoutLock(user.id)], 3000, {
        retryCount: 0
      });

      const emailAlreadySent = await keyStore.getItem(KeyStorePrefixes.UserMfaUnlockEmailSent(user.id));
      if (!emailAlreadySent) {
        const unlockToken = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_USER_UNLOCK,
          userId: user.id
        });

        await smtpService.sendMail({
          template: SmtpTemplates.UnlockAccount,
          subjectLine: "Unlock your Infisical account",
          recipients: [user.email],
          substitutions: {
            token: unlockToken,
            callback_url: `${appCfg.SITE_URL}/api/v1/user/${user.id}/unlock`
          }
        });

        await keyStore.setItemWithExpiry(
          KeyStorePrefixes.UserMfaUnlockEmailSent(user.id),
          KeyStoreTtls.UserMfaUnlockEmailSentInSeconds,
          "1"
        );
      }
    } catch (lockErr) {
      if (lock) {
        logger.error(lockErr, "Failed to send unlock email");
      }
    } finally {
      if (lock) {
        await lock.release();
      }
    }
  };

  // Records a failed MFA attempt and, if it tipped the account into a locked
  // state, dispatches the unlock email. Returns the updated user.
  const handleFailedMfaAttempt = async (userId: string) => {
    const updatedUser = await processFailedMfaAttempt(userId);
    await sendMfaUnlockEmail(updatedUser);
    return updatedUser;
  };

  // Clears the failed-attempt counter and any temporary lock after a successful
  // verification.
  const resetMfaLockStatus = async (userId: string) => {
    await userDAL.updateById(userId, {
      consecutiveFailedMfaAttempts: 0,
      temporaryLockDateEnd: null
    });
  };

  return {
    enforceMfaLockStatus,
    handleFailedMfaAttempt,
    resetMfaLockStatus
  };
};
