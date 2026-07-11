import { FastifyRequest } from "fastify";

import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { AuthMode, MfaMethod } from "@app/services/auth/auth-type";
import { MfaStepUpResource, TMfaStepUpResource } from "@app/services/mfa-session/mfa-session-types";

export { MfaStepUpResource };
export type { TMfaStepUpResource };

// The step-up grace is scoped to the CURRENT login session (tokenVersionId), never the
// user, so proving MFA in one session can't authorize another. All step-up-gated routes
// are JWT-only, so the request always carries a session id; this narrows req.auth to
// read it (and rejects any non-user auth mode defensively).
export const getStepUpSessionId = (req: FastifyRequest): string => {
  if (req.auth.authMode !== AuthMode.JWT) {
    throw new UnauthorizedError({ message: "This action requires a user session" });
  }
  return req.auth.tokenVersionId;
};

/**
 * Enforces that the caller has completed a fresh MFA challenge before a sensitive
 * action, reusing the Redis-backed step-up MFA session primitive (mirrors the PAM
 * account-access flow).
 *
 * A verified session is reusable for the remainder of its TTL (10 min) and is bound
 * to `resourceId`, so it cannot be replayed against a different action.
 *
 * - With a valid, verified session for this user + resource: returns immediately.
 * - Otherwise (no session id, or one that is missing/expired/unverified/foreign):
 *   mints a fresh pending session (emailing the code when the required method is
 *   email) and throws `SESSION_MFA_REQUIRED` carrying the new session id + method
 *   so the client can drive the challenge and retry.
 *
 * By default the challenged method is the one the current org context requires (the
 * enforced method, or the user's preference otherwise). Pass `mfaMethod` to override
 * this when the action dictates the method independently of org enforcement — e.g.
 * enabling MFA challenges the factor being enabled, not a stronger org-enforced one.
 */
export const ensureStepUpMfa = async (
  server: FastifyZodProvider,
  {
    userId,
    orgId,
    tokenVersionId,
    resourceId,
    mfaSessionId,
    message,
    mfaMethod: mfaMethodOverride
  }: {
    userId: string;
    orgId: string;
    tokenVersionId: string;
    resourceId: TMfaStepUpResource;
    mfaSessionId?: string;
    message: string;
    mfaMethod?: MfaMethod;
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

  if (
    resourceId === MfaStepUpResource.MfaManagement &&
    (await server.services.mfaSession.hasRecentMfaAuth(tokenVersionId))
  ) {
    return;
  }

  await server.services.mfaSession.enforceStepUpMfaLockout(userId);

  const user = await server.services.user.getMe(userId);

  const mfaMethod = mfaMethodOverride ?? (await server.services.user.getStepUpMfaMethod(userId, orgId));

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
