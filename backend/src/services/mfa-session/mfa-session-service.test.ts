import { describe, expect, type Mocked, test, vi } from "vitest";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ForbiddenRequestError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";

import { mfaSessionServiceFactory } from "./mfa-session-service";
import { MfaSessionStatus, MfaStepUpResource, TMfaSession } from "./mfa-session-types";

const USER_ID = "user-1";
const SESSION_ID = "mfa-session-1";
const TOKEN_VERSION = "login-session-a";

type KeyStoreSlice = Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "setItemWithExpiryNX" | "deleteItem">;

const makeKeyStore = (session: TMfaSession | null): Mocked<KeyStoreSlice> =>
  ({
    getItem: vi.fn(async (key: string) =>
      key === KeyStorePrefixes.MfaSession(SESSION_ID) && session ? JSON.stringify(session) : null
    ),
    setItemWithExpiry: vi.fn().mockResolvedValue("OK"),
    setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
    deleteItem: vi.fn().mockResolvedValue(1)
  }) as Mocked<KeyStoreSlice>;

const makeService = (keyStore: Mocked<KeyStoreSlice>, mfaLockoutService: Record<string, unknown> = {}) =>
  mfaSessionServiceFactory({
    keyStore: keyStore as never,
    tokenService: {
      createTokenForUser: vi.fn().mockResolvedValue("code"),
      validateTokenForUser: vi.fn().mockResolvedValue(undefined)
    } as never,
    smtpService: { sendMail: vi.fn().mockResolvedValue(undefined) } as never,
    totpService: { verifyUserTotp: vi.fn().mockResolvedValue(undefined) } as never,
    mfaLockoutService: {
      enforceStepUpMfaLockStatus: vi.fn().mockResolvedValue(undefined),
      reserveStepUpMfaAttempt: vi.fn().mockResolvedValue(undefined),
      resetStepUpMfaLockStatus: vi.fn().mockResolvedValue(undefined),
      hasRecentMfaAuth: vi.fn().mockResolvedValue(false),
      recordRecentMfaAuth: vi.fn().mockResolvedValue(undefined),
      ...mfaLockoutService
    } as never
  });

const activeSession = (overrides: Partial<TMfaSession> = {}): TMfaSession => ({
  sessionId: SESSION_ID,
  userId: USER_ID,
  resourceId: MfaStepUpResource.MfaManagement,
  status: MfaSessionStatus.ACTIVE,
  mfaMethod: MfaMethod.EMAIL,
  initiatingTokenVersionId: TOKEN_VERSION,
  ...overrides
});

const activeArgs = {
  mfaSessionId: SESSION_ID,
  userId: USER_ID,
  resourceId: MfaStepUpResource.MfaManagement,
  tokenVersionId: TOKEN_VERSION
};

describe("mfaSessionService.isMfaSessionActive binding guard", () => {
  test("accepts a matching active session", async () => {
    const service = makeService(makeKeyStore(activeSession()));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(true);
  });

  test("rejects a missing session", async () => {
    const service = makeService(makeKeyStore(null));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(false);
  });

  test("rejects a session belonging to another user", async () => {
    const service = makeService(makeKeyStore(activeSession({ userId: "someone-else" })));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(false);
  });

  test("rejects replay against a different resource", async () => {
    const service = makeService(makeKeyStore(activeSession({ resourceId: MfaStepUpResource.MfaActivation })));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(false);
  });

  test("rejects a session that has not been verified", async () => {
    const service = makeService(makeKeyStore(activeSession({ status: MfaSessionStatus.PENDING })));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(false);
  });

  test("rejects a session bound to a different login session", async () => {
    const service = makeService(makeKeyStore(activeSession({ initiatingTokenVersionId: "login-session-b" })));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(false);
  });

  test("accepts a legacy session with no bound login session", async () => {
    const service = makeService(makeKeyStore(activeSession({ initiatingTokenVersionId: undefined })));
    await expect(service.isMfaSessionActive(activeArgs)).resolves.toBe(true);
  });
});

describe("mfaSessionService.verifyMfaSession", () => {
  test("rejects verification from a different login session", async () => {
    const service = makeService(makeKeyStore(activeSession({ status: MfaSessionStatus.PENDING })));

    await expect(
      service.verifyMfaSession({
        mfaSessionId: SESSION_ID,
        userId: USER_ID,
        tokenVersionId: "login-session-b",
        mfaToken: "123456",
        mfaMethod: MfaMethod.EMAIL
      })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("flips a pending session to active and records recent auth for MFA management", async () => {
    const keyStore = makeKeyStore(activeSession({ status: MfaSessionStatus.PENDING }));
    const recordRecentMfaAuth = vi.fn().mockResolvedValue(undefined);
    const service = makeService(keyStore, { recordRecentMfaAuth });

    await service.verifyMfaSession({
      mfaSessionId: SESSION_ID,
      userId: USER_ID,
      tokenVersionId: TOKEN_VERSION,
      mfaToken: "123456",
      mfaMethod: MfaMethod.EMAIL
    });

    const persisted = JSON.parse(keyStore.setItemWithExpiry.mock.calls.at(-1)![2] as string) as TMfaSession;
    expect(persisted.status).toBe(MfaSessionStatus.ACTIVE);
    expect(recordRecentMfaAuth).toHaveBeenCalledWith(USER_ID, TOKEN_VERSION);
  });
});
