import { getUserAllowedMfaMethods, resolveMfaChallenge } from "@app/services/auth/auth-fns";
import { MfaMethod } from "@app/services/auth/auth-type";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { MfaSessionStatus } from "@app/services/mfa-session/mfa-session-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { TUserServiceFactory } from "@app/services/user/user-service";

import { BadRequestError } from "../../../lib/errors";

type TMfaDeps = {
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "getMfaSession" | "deleteMfaSession" | "sendMfaCode"
  >;
  orgDAL: Pick<TOrgDALFactory, "findRootOrgDetails">;
  userDAL: Pick<TUserDALFactory, "findById">;
  userService: Pick<TUserServiceFactory, "getEnrolledMfaMethods">;
};

export const enforceMfa = async (
  { mfaSessionService, orgDAL, userDAL, userService }: TMfaDeps,
  {
    userId,
    orgId,
    actorEmail,
    accountId,
    mfaSessionId,
    tokenVersionId,
    allowCliHandoff
  }: {
    userId: string;
    orgId: string;
    actorEmail: string;
    accountId: string;
    mfaSessionId?: string;
    tokenVersionId?: string;
    allowCliHandoff?: boolean;
  }
) => {
  if (!mfaSessionId) {
    // A sub-org session carries the sub-org's id, but the MFA policy lives on its root org.
    const org = await orgDAL.findRootOrgDetails(orgId);
    const user = await userDAL.findById(userId);

    const allowedMethods =
      org?.enforceMfa || user?.isMfaEnabled ? getUserAllowedMfaMethods(org ?? {}, user ?? {}) : [MfaMethod.EMAIL];
    const enrolledMethods = user ? await userService.getEnrolledMfaMethods(user) : [];
    const { challengeMethod } = resolveMfaChallenge({
      allowedMethods,
      enrolledMethods,
      preferredMethod: user?.selectedMfaMethod
    });
    const mfaMethod = challengeMethod ?? allowedMethods[0];

    // Bound to the session that raised the challenge
    const newMfaSessionId = await mfaSessionService.createMfaSession(
      userId,
      accountId,
      mfaMethod,
      tokenVersionId,
      allowCliHandoff
    );

    if (mfaMethod === MfaMethod.EMAIL && actorEmail) {
      await mfaSessionService.sendMfaCode(userId, actorEmail);
    }

    throw new BadRequestError({
      name: "SESSION_MFA_REQUIRED",
      message: "MFA verification required to access this account",
      details: { mfaSessionId: newMfaSessionId, mfaMethod }
    });
  }

  const mfaSession = await mfaSessionService.getMfaSession(mfaSessionId);
  if (!mfaSession) {
    throw new BadRequestError({ message: "MFA session not found or expired" });
  }
  if (mfaSession.userId !== userId) {
    throw new BadRequestError({ message: "MFA session does not belong to current user" });
  }
  if (mfaSession.resourceId !== accountId) {
    throw new BadRequestError({ message: "MFA session is for a different account" });
  }
  if (mfaSession.initiatingTokenVersionId && mfaSession.initiatingTokenVersionId !== tokenVersionId) {
    throw new BadRequestError({ message: "MFA session belongs to a different login session" });
  }
  if (mfaSession.status !== MfaSessionStatus.ACTIVE) {
    throw new BadRequestError({ message: "MFA session is not verified. Please complete MFA verification first." });
  }
  await mfaSessionService.deleteMfaSession(mfaSessionId);
};
