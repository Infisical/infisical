import { MfaMethod } from "@app/services/auth/auth-type";
import { TMfaSessionServiceFactory } from "@app/services/mfa-session/mfa-session-service";
import { MfaSessionStatus } from "@app/services/mfa-session/mfa-session-types";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { BadRequestError } from "../../../lib/errors";

type TMfaDeps = {
  mfaSessionService: Pick<
    TMfaSessionServiceFactory,
    "createMfaSession" | "getMfaSession" | "deleteMfaSession" | "sendMfaCode"
  >;
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  userDAL: Pick<TUserDALFactory, "findById">;
};

export const enforceMfa = async (
  { mfaSessionService, orgDAL, userDAL }: TMfaDeps,
  {
    userId,
    orgId,
    actorEmail,
    accountId,
    mfaSessionId
  }: {
    userId: string;
    orgId: string;
    actorEmail: string;
    accountId: string;
    mfaSessionId?: string;
  }
) => {
  if (!mfaSessionId) {
    const org = await orgDAL.findOrgById(orgId);
    const user = await userDAL.findById(userId);

    const orgMfaMethod = org?.enforceMfa ? (org.selectedMfaMethod as MfaMethod | null) : undefined;
    const userMfaMethod = user?.isMfaEnabled ? (user.selectedMfaMethod as MfaMethod | null) : undefined;
    const mfaMethod = (orgMfaMethod ?? userMfaMethod ?? MfaMethod.EMAIL) as MfaMethod;

    const newMfaSessionId = await mfaSessionService.createMfaSession(userId, accountId, mfaMethod);

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
  if (mfaSession.status !== MfaSessionStatus.ACTIVE) {
    throw new BadRequestError({ message: "MFA session is not verified. Please complete MFA verification first." });
  }
  await mfaSessionService.deleteMfaSession(mfaSessionId);
};
