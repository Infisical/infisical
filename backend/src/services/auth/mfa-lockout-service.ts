import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { DatabaseError, ForbiddenRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

const PROGRESSIVE_DELAY_INTERVAL = 5;
const PROGRESSIVE_DELAYS_IN_MINS = [5, 30, 60];

const STEP_UP_MFA_MAX_ATTEMPTS = 5;

type TMfaLockoutServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "updateById" | "transaction">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  keyStore: Pick<
    TKeyStoreFactory,
    "acquireLock" | "getItem" | "setItemWithExpiry" | "ttl" | "incrementByWithExpiry" | "deleteItem"
  >;
};

export type TMfaLockoutServiceFactory = ReturnType<typeof mfaLockoutServiceFactory>;

export const mfaLockoutServiceFactory = ({
  userDAL,
  tokenService,
  smtpService,
  keyStore
}: TMfaLockoutServiceFactoryDep) => {
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

  const throwStepUpMfaLocked = (remainingSeconds: number): never => {
    const timeDisplay =
      remainingSeconds > 60 ? `${Math.ceil(remainingSeconds / 60)} minutes` : `${Math.ceil(remainingSeconds)} seconds`;

    throw new ForbiddenRequestError({
      name: "UserLocked",
      message: `Too many failed MFA attempts. Try again after ${timeDisplay}.`
    });
  };

  // Rejects the request when the user is currently within a temporary step-up MFA
  // lockout window. Backed purely by Redis (a lock key with a TTL) so it self-clears
  // when the window expires - there is no permanent lock here, unlike the login flow.
  const enforceStepUpMfaLockStatus = async (userId: string) => {
    const remainingSeconds = await keyStore.ttl(KeyStorePrefixes.UserStepUpMfaLockout(userId));
    if (remainingSeconds > 0) {
      throwStepUpMfaLocked(remainingSeconds);
    }
  };

  // Atomically claims one step-up MFA attempt slot BEFORE the code is validated, so a
  // burst of concurrent guesses on a stolen session can't all slip past the check and
  // exceed the attempt cap (each guess incremented the counter only after validating,
  // so parallel requests raced the lockout). The Redis INCR is atomic, so concurrent
  // callers get distinct sequence numbers: only the first STEP_UP_MFA_MAX_ATTEMPTS ever
  // reach validation. Once the cap is exceeded we engage the temporary lockout and
  // reject; the counter self-clears via its rolling window (or on success/lockout).
  const reserveStepUpMfaAttempt = async (userId: string) => {
    const attemptsKey = KeyStorePrefixes.UserStepUpMfaAttempts(userId);
    const attempts = await keyStore.incrementByWithExpiry(attemptsKey, 1, KeyStoreTtls.StepUpMfaAttemptWindowInSeconds);

    if (attempts > STEP_UP_MFA_MAX_ATTEMPTS) {
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.UserStepUpMfaLockout(userId),
        KeyStoreTtls.StepUpMfaLockoutInSeconds,
        "1"
      );
      await keyStore.deleteItem(attemptsKey);
      throwStepUpMfaLocked(KeyStoreTtls.StepUpMfaLockoutInSeconds);
    }
  };

  // Clears the step-up failure counter and any temporary lockout after a successful
  // verification.
  const resetStepUpMfaLockStatus = async (userId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.UserStepUpMfaAttempts(userId));
    await keyStore.deleteItem(KeyStorePrefixes.UserStepUpMfaLockout(userId));
  };

  // Records that the user just completed a full MFA login. A completed login proves a
  // second factor at least as strong as any step-up challenge (it satisfies the org's
  // required method, or is a recovery code that bypasses it), so within this window an
  // MFA-management step-up is redundant. This is what lets a user who lost their only
  // configured factor, and logged in via a recovery code, still reach their MFA
  // settings to disable it or switch the preferred method. It self-clears on TTL; if
  // the window lapses, another login re-opens it.
  const recordRecentMfaAuth = async (userId: string) => {
    await keyStore.setItemWithExpiry(KeyStorePrefixes.RecentMfaAuth(userId), KeyStoreTtls.MfaSessionInSeconds, "1");
  };

  const hasRecentMfaAuth = async (userId: string): Promise<boolean> => {
    return Boolean(await keyStore.getItem(KeyStorePrefixes.RecentMfaAuth(userId)));
  };

  return {
    handleFailedMfaAttempt,
    resetMfaLockStatus,
    enforceStepUpMfaLockStatus,
    reserveStepUpMfaAttempt,
    resetStepUpMfaLockStatus,
    recordRecentMfaAuth,
    hasRecentMfaAuth
  };
};
