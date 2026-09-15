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
 * A verified session is reusable for the remainder of its TTL (5 min) and is bound
 * to `resourceId` and to the factor it proved, so it cannot be replayed against a
 * different action, nor against one that would not have challenged that factor.
 *
 * - With a valid, verified session for this user + resource whose proven factor is
 *   one this action would challenge: returns immediately.
 * - Otherwise (no session id, or one that is missing/expired/unverified/foreign, or
 *   proving a factor this action does not accept): mints a fresh pending session
 *   (emailing the code when the required method is email) and throws
 *   `SESSION_MFA_REQUIRED` carrying the new session id + method so the client can
 *   drive the challenge and retry.
 *
 * By default the challenged method is the one the current org context requires (the
 * enforced method, or the user's preference otherwise). Pass `mfaMethod` to override
 * this when the action dictates the method independently of org enforcement — e.g.
 * enabling MFA challenges the factor being enabled, not a stronger org-enforced one.
 * Pass `excludeMfaMethod` when the action removes a factor, so the challenge never
 * demands the factor being removed (which is usually the one the user has lost).
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
    mfaMethod: mfaMethodOverride,
    excludeMfaMethod
  }: {
    userId: string;
    orgId: string;
    tokenVersionId: string;
    resourceId: TMfaStepUpResource;
    mfaSessionId?: string;
    message: string;
    mfaMethod?: MfaMethod;
    excludeMfaMethod?: MfaMethod;
  }
) => {
  const isMfaManagement = resourceId === MfaStepUpResource.MfaManagement;

  if (isMfaManagement && !(await server.services.user.isStepUpMfaRequired(userId))) return;

  // Resolved before honouring any prior proof: a factor-removal action falls back to a
  // substitute factor, and a proof of that substitute must not satisfy the other
  // management actions, which would never have challenged it.
  const { challenge: mfaMethod, accepted: acceptedMfaMethods } = mfaMethodOverride
    ? { challenge: mfaMethodOverride, accepted: [mfaMethodOverride] }
    : await server.services.user.getStepUpMfaMethod(userId, orgId, excludeMfaMethod);

  if (
    mfaSessionId &&
    (await server.services.mfaSession.isMfaSessionActive({
      mfaSessionId,
      userId,
      resourceId,
      tokenVersionId,
      acceptedMfaMethods
    }))
  ) {
    return;
  }

  if (
    isMfaManagement &&
    (await server.services.mfaSession.hasRecentMfaAuth(userId, tokenVersionId, acceptedMfaMethods))
  ) {
    return;
  }

  await server.services.mfaSession.enforceStepUpMfaLockout(userId);

  const user = await server.services.user.getMe(userId);

  const newMfaSessionId = await server.services.mfaSession.createMfaSession(
    userId,
    resourceId,
    mfaMethod,
    tokenVersionId
  );

  if (mfaMethod === MfaMethod.EMAIL && user.email) {
    await server.services.mfaSession.sendMfaCode(userId, user.email);
  }

  throw new BadRequestError({
    message,
    name: "SESSION_MFA_REQUIRED",
    details: { mfaSessionId: newMfaSessionId, mfaMethod }
  });
};
