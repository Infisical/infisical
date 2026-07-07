import { BadRequestError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";

// Sensitive account actions that expose or weaken a login second factor require a
// fresh MFA challenge, not just a valid session token. Each action binds its
// step-up MFA session to a dedicated resource id so a session minted for one
// action (e.g. viewing recovery codes) can't be replayed against another (e.g.
// disabling MFA).
export const MfaStepUpResource = {
  RecoveryCodes: "mfa-recovery-codes",
  DisableMfa: "mfa-disable"
} as const;

export type TMfaStepUpResource = (typeof MfaStepUpResource)[keyof typeof MfaStepUpResource];

/**
 * Enforces that the caller has completed a fresh MFA challenge before a sensitive
 * action, reusing the Redis-backed step-up MFA session primitive (mirrors the PAM
 * account-access flow).
 *
 * A verified session is reusable for the remainder of its TTL (5 min) and is bound
 * to `resourceId`, so it cannot be replayed against a different action.
 *
 * - With a valid, verified session for this user + resource: returns immediately.
 * - Otherwise (no session id, or one that is missing/expired/unverified/foreign):
 *   mints a fresh pending session (emailing the code when the user's method is
 *   email) and throws `SESSION_MFA_REQUIRED` carrying the new session id + method
 *   so the client can drive the challenge and retry.
 */
export const ensureStepUpMfa = async (
  server: FastifyZodProvider,
  {
    userId,
    resourceId,
    mfaSessionId,
    message
  }: {
    userId: string;
    resourceId: TMfaStepUpResource;
    mfaSessionId?: string;
    message: string;
  }
) => {
  if (
    mfaSessionId &&
    (await server.services.mfaSession.isMfaSessionActive({
      mfaSessionId,
      userId,
      resourceId
    }))
  ) {
    return;
  }

  const user = await server.services.user.getMe(userId);
  const mfaMethod = (user.selectedMfaMethod as MfaMethod | null) ?? MfaMethod.EMAIL;

  const newMfaSessionId = await server.services.mfaSession.createMfaSession(userId, resourceId, mfaMethod);

  if (mfaMethod === MfaMethod.EMAIL && user.email) {
    await server.services.mfaSession.sendMfaCode(userId, user.email);
  }

  throw new BadRequestError({
    message,
    name: "SESSION_MFA_REQUIRED",
    details: { mfaSessionId: newMfaSessionId, mfaMethod }
  });
};
