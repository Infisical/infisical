import { BadRequestError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";

// Sensitive account actions that expose or weaken a login second factor require a
// fresh MFA challenge, not just a valid session token. The session binds to a
// resource id so a session minted for one flow can't be replayed against an
// unrelated one (e.g. a PAM account-access session can't be used here).
//
// Viewing recovery codes, rotating recovery codes, and disabling MFA are all
// MFA-management actions of comparable risk, so they intentionally share a single
// resource id: one fresh challenge covers all of them for the session TTL (5 min)
// rather than re-prompting the user for each action in quick succession.
export const MfaStepUpResource = {
  MfaManagement: "mfa-management"
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
 *   mints a fresh pending session (emailing the code when the required method is
 *   email) and throws `SESSION_MFA_REQUIRED` carrying the new session id + method
 *   so the client can drive the challenge and retry.
 */
export const ensureStepUpMfa = async (
  server: FastifyZodProvider,
  {
    userId,
    orgId,
    resourceId,
    mfaSessionId,
    message
  }: {
    userId: string;
    orgId: string;
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

  const mfaMethod = await server.services.user.getStepUpMfaMethod(userId, orgId);

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
