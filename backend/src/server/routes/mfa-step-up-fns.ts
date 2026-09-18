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
 * Gates a sensitive action behind a fresh MFA challenge, on the same Redis step-up
 * primitive PAM uses.
 *
 * A verified session lives for its TTL (5 min) and is tied to the resource and to the
 * factor it proved, so it can't be replayed on another action, or on one that would
 * never have asked for that factor. Without a usable proof we mint a pending session
 * (emailing the code when that's the method) and throw SESSION_MFA_REQUIRED with the
 * session id and method, so the client runs the challenge and retries.
 *
 * The challenged method is what the current org context requires: the enforced method,
 * else the user's preference. `mfaMethod` overrides that when the action itself picks
 * the factor, e.g. enabling MFA challenges the factor being enabled. `excludeMfaMethod`
 * is for removing a factor: never ask for the one being removed, it's usually the one
 * that got lost.
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

  // Resolve the method first: a removal action may fall back to a substitute factor,
  // and a proof of that substitute must not unlock the other management actions.
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
