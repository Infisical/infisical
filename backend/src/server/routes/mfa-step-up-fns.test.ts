import { describe, expect, test, vi } from "vitest";

import { MfaMethod } from "@app/services/auth/auth-type";

import { ensureStepUpMfa, MfaStepUpResource } from "./mfa-step-up-fns";

const USER_ID = "user-1";
const ORG_ID = "org-1";
const TOKEN_VERSION = "login-session-a";
const SESSION_ID = "mfa-session-1";

type TResolved = { challenge: MfaMethod; accepted: MfaMethod[] };

type ServerPatch = {
  isStepUpMfaRequired?: boolean;
  resolved?: TResolved;
  activeSessionMethod?: MfaMethod;
  recentAuthMethod?: MfaMethod;
};

const makeServer = (patch: ServerPatch = {}) => {
  const mfaSession = {
    isMfaSessionActive: vi.fn(async ({ acceptedMfaMethods }: { acceptedMfaMethods?: MfaMethod[] }) =>
      Boolean(patch.activeSessionMethod && acceptedMfaMethods?.includes(patch.activeSessionMethod))
    ),
    hasRecentMfaAuth: vi.fn(async (_userId: string, _tokenVersionId: string, acceptedMfaMethods: MfaMethod[]) =>
      Boolean(patch.recentAuthMethod && acceptedMfaMethods.includes(patch.recentAuthMethod))
    ),
    enforceStepUpMfaLockout: vi.fn().mockResolvedValue(undefined),
    createMfaSession: vi.fn().mockResolvedValue("new-session"),
    sendMfaCode: vi.fn().mockResolvedValue(undefined)
  };
  const user = {
    isStepUpMfaRequired: vi.fn().mockResolvedValue(patch.isStepUpMfaRequired ?? true),
    getStepUpMfaMethod: vi
      .fn()
      .mockResolvedValue(patch.resolved ?? { challenge: MfaMethod.TOTP, accepted: [MfaMethod.TOTP] }),
    getMe: vi.fn().mockResolvedValue({ id: USER_ID, email: "user@example.com" })
  };
  return { server: { services: { mfaSession, user } } as never, mfaSession, user };
};

const baseArgs = {
  userId: USER_ID,
  orgId: ORG_ID,
  tokenVersionId: TOKEN_VERSION,
  resourceId: MfaStepUpResource.MfaManagement,
  message: "MFA required"
};

const removalResolved: TResolved = { challenge: MfaMethod.EMAIL, accepted: [MfaMethod.TOTP, MfaMethod.EMAIL] };

describe("ensureStepUpMfa binds prior proof to the factors the action would challenge", () => {
  test("resolves the method before consulting any prior proof and passes the accepted set along", async () => {
    const { server, mfaSession, user } = makeServer();

    await expect(ensureStepUpMfa(server, { ...baseArgs, mfaSessionId: SESSION_ID })).rejects.toMatchObject({
      name: "SESSION_MFA_REQUIRED",
      details: { mfaMethod: MfaMethod.TOTP }
    });

    expect(user.getStepUpMfaMethod).toHaveBeenCalledWith(USER_ID, ORG_ID, undefined);
    expect(mfaSession.isMfaSessionActive).toHaveBeenCalledWith(
      expect.objectContaining({ mfaSessionId: SESSION_ID, acceptedMfaMethods: [MfaMethod.TOTP] })
    );
    expect(mfaSession.hasRecentMfaAuth).toHaveBeenCalledWith(USER_ID, TOKEN_VERSION, [MfaMethod.TOTP]);
  });

  test("a factor-removal action challenges the substitute and forwards the excluded factor", async () => {
    const { server, user } = makeServer({ resolved: removalResolved });

    await expect(ensureStepUpMfa(server, { ...baseArgs, excludeMfaMethod: MfaMethod.TOTP })).rejects.toMatchObject({
      name: "SESSION_MFA_REQUIRED",
      details: { mfaMethod: MfaMethod.EMAIL }
    });

    expect(user.getStepUpMfaMethod).toHaveBeenCalledWith(USER_ID, ORG_ID, MfaMethod.TOTP);
  });

  test("a session minted for the removal substitute is not accepted by other management actions", async () => {
    const { server, mfaSession } = makeServer({ activeSessionMethod: MfaMethod.EMAIL });

    await expect(ensureStepUpMfa(server, { ...baseArgs, mfaSessionId: SESSION_ID })).rejects.toMatchObject({
      name: "SESSION_MFA_REQUIRED",
      details: { mfaMethod: MfaMethod.TOTP }
    });
    expect(mfaSession.createMfaSession).toHaveBeenCalledWith(
      USER_ID,
      baseArgs.resourceId,
      MfaMethod.TOTP,
      TOKEN_VERSION
    );
  });

  test("a grace window opened by the removal substitute does not cover other management actions", async () => {
    const { server } = makeServer({ recentAuthMethod: MfaMethod.EMAIL });

    await expect(ensureStepUpMfa(server, baseArgs)).rejects.toMatchObject({ name: "SESSION_MFA_REQUIRED" });
  });

  test("the removal action itself honours a proof of either the required method or the substitute", async () => {
    const viaSubstitute = makeServer({ resolved: removalResolved, recentAuthMethod: MfaMethod.EMAIL });
    await expect(
      ensureStepUpMfa(viaSubstitute.server, { ...baseArgs, excludeMfaMethod: MfaMethod.TOTP })
    ).resolves.toBeUndefined();
    expect(viaSubstitute.mfaSession.createMfaSession).not.toHaveBeenCalled();

    const viaRequired = makeServer({ resolved: removalResolved, recentAuthMethod: MfaMethod.TOTP });
    await expect(
      ensureStepUpMfa(viaRequired.server, { ...baseArgs, excludeMfaMethod: MfaMethod.TOTP })
    ).resolves.toBeUndefined();
    expect(viaRequired.mfaSession.createMfaSession).not.toHaveBeenCalled();
  });

  test("an explicit method override is the only factor prior proof is measured against", async () => {
    const { server, mfaSession, user } = makeServer({ activeSessionMethod: MfaMethod.WEBAUTHN });

    await expect(
      ensureStepUpMfa(server, {
        ...baseArgs,
        resourceId: MfaStepUpResource.MfaActivation,
        mfaMethod: MfaMethod.WEBAUTHN,
        mfaSessionId: SESSION_ID
      })
    ).resolves.toBeUndefined();
    expect(mfaSession.isMfaSessionActive).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedMfaMethods: [MfaMethod.WEBAUTHN] })
    );
    expect(user.getStepUpMfaMethod).not.toHaveBeenCalled();
    expect(mfaSession.hasRecentMfaAuth).not.toHaveBeenCalled();
  });

  test("skips everything when no step-up is required for MFA management", async () => {
    const { server, mfaSession, user } = makeServer({ isStepUpMfaRequired: false });

    await expect(ensureStepUpMfa(server, baseArgs)).resolves.toBeUndefined();
    expect(user.getStepUpMfaMethod).not.toHaveBeenCalled();
    expect(mfaSession.isMfaSessionActive).not.toHaveBeenCalled();
  });
});
