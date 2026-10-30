import { describe, expect, type Mocked, test, vi } from "vitest";

import { enforceMfa } from "@app/ee/services/pam/pam-mfa";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { MfaMethod } from "@app/services/auth/auth-type";

import { mfaSessionServiceFactory } from "./mfa-session-service";
import { MfaSessionStatus, MfaStepUpResource, TMfaSession } from "./mfa-session-types";

const USER_ID = "user-1";
const SESSION_ID = "mfa-session-1";
const TOKEN_VERSION = "login-session-a";
const ACCOUNT_ID = "pam-account-1";

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

const makeService = (
  keyStore: Mocked<KeyStoreSlice>,
  mfaLockoutService: Record<string, unknown> = {},
  initiatingSessionUserAgent?: string
) =>
  mfaSessionServiceFactory({
    keyStore: keyStore as never,
    tokenService: {
      createTokenForUser: vi.fn().mockResolvedValue("code"),
      validateTokenForUser: vi.fn().mockResolvedValue(undefined),
      getUserTokenSessionById: vi.fn(async (id: string, userId: string) =>
        id === TOKEN_VERSION && userId === USER_ID && initiatingSessionUserAgent
          ? { id, userId, userAgent: initiatingSessionUserAgent }
          : undefined
      )
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

  test("rejects replay of a proof against an action that would not challenge that factor", async () => {
    const service = makeService(makeKeyStore(activeSession({ mfaMethod: MfaMethod.EMAIL })));
    await expect(service.isMfaSessionActive({ ...activeArgs, acceptedMfaMethods: [MfaMethod.TOTP] })).resolves.toBe(
      false
    );
  });

  test("accepts a proof of a factor the action would challenge", async () => {
    const service = makeService(makeKeyStore(activeSession({ mfaMethod: MfaMethod.EMAIL })));
    await expect(
      service.isMfaSessionActive({ ...activeArgs, acceptedMfaMethods: [MfaMethod.TOTP, MfaMethod.EMAIL] })
    ).resolves.toBe(true);
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

  test("flips a pending session to active and records the proven factor for MFA management", async () => {
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
    expect(recordRecentMfaAuth).toHaveBeenCalledWith(USER_ID, TOKEN_VERSION, MfaMethod.EMAIL);
  });
});

describe("mfaSessionService completing a challenge from another login session", () => {
  const browserArgs = { mfaSessionId: SESSION_ID, userId: USER_ID, tokenVersionId: "browser-session" };
  const pendingSession = activeSession({ status: MfaSessionStatus.PENDING, allowCliHandoff: true });

  test("lets the user's browser complete a challenge raised by their CLI session", async () => {
    const keyStore = makeKeyStore(pendingSession);
    const service = makeService(keyStore, {}, "cli");

    await expect(service.getMfaSessionStatus(browserArgs)).resolves.toEqual({
      status: MfaSessionStatus.PENDING,
      mfaMethod: MfaMethod.EMAIL
    });
    await expect(
      service.verifyMfaSession({ ...browserArgs, mfaToken: "123456", mfaMethod: MfaMethod.EMAIL })
    ).resolves.toMatchObject({ success: true });
  });

  test("keeps step-up challenges raised by a CLI session bound to that session", async () => {
    const service = makeService(makeKeyStore(activeSession({ status: MfaSessionStatus.PENDING })), {}, "cli");

    await expect(service.getMfaSessionStatus(browserArgs)).rejects.toBeInstanceOf(ForbiddenRequestError);
    await expect(
      service.verifyMfaSession({ ...browserArgs, mfaToken: "123456", mfaMethod: MfaMethod.EMAIL })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("a challenge verified in the browser is accepted by enforceMfa only from the CLI session", async () => {
    const store = new Map<string, string>();
    const keyStore = {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItemWithExpiry: vi.fn(async (key: string, _ttl: number, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
      deleteItem: vi.fn(async (key: string) => Number(store.delete(key)))
    } as Mocked<KeyStoreSlice>;
    const service = makeService(keyStore, {}, "cli");
    const enforce = (tokenVersionId: string, mfaSessionId?: string) =>
      enforceMfa(
        {
          mfaSessionService: service,
          orgDAL: { findOrgById: vi.fn().mockResolvedValue({ enforceMfa: false }) } as never,
          userDAL: { findById: vi.fn().mockResolvedValue({ isMfaEnabled: false }) } as never
        },
        {
          userId: USER_ID,
          orgId: "org-1",
          actorEmail: "",
          accountId: ACCOUNT_ID,
          mfaSessionId,
          tokenVersionId,
          allowCliHandoff: true
        }
      );

    const challenge = (await enforce(TOKEN_VERSION).catch((err: unknown) => err)) as BadRequestError;
    const { mfaSessionId } = challenge.details as { mfaSessionId: string };
    await service.verifyMfaSession({ ...browserArgs, mfaSessionId, mfaToken: "123456", mfaMethod: MfaMethod.EMAIL });

    await expect(enforce("browser-session", mfaSessionId)).rejects.toThrow(
      "MFA session belongs to a different login session"
    );
    await expect(enforce(TOKEN_VERSION, mfaSessionId)).resolves.toBeUndefined();
  });

  test("rejects a challenge raised by another browser session", async () => {
    const service = makeService(makeKeyStore(pendingSession), {}, "Mozilla/5.0");

    await expect(service.getMfaSessionStatus(browserArgs)).rejects.toBeInstanceOf(ForbiddenRequestError);
    await expect(
      service.verifyMfaSession({ ...browserArgs, mfaToken: "123456", mfaMethod: MfaMethod.EMAIL })
    ).rejects.toBeInstanceOf(ForbiddenRequestError);
  });

  test("rejects a challenge whose initiating session no longer exists", async () => {
    const service = makeService(makeKeyStore(pendingSession));
    await expect(service.getMfaSessionStatus(browserArgs)).rejects.toBeInstanceOf(ForbiddenRequestError);
  });
});
