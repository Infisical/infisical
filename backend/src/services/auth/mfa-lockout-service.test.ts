import { describe, expect, type Mocked, test, vi } from "vitest";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { ForbiddenRequestError } from "@app/lib/errors";

import { mfaLockoutServiceFactory } from "./mfa-lockout-service";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ SITE_URL: "https://app.example.com" })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const USER_ID = "user-1";

type KeyStoreSlice = Pick<
  TKeyStoreFactory,
  "acquireLock" | "getItem" | "setItemWithExpiry" | "ttl" | "incrementByWithExpiry" | "deleteItem"
>;

const makeKeyStore = (patch: Partial<Mocked<KeyStoreSlice>> = {}): Mocked<KeyStoreSlice> =>
  ({
    acquireLock: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }),
    getItem: vi.fn().mockResolvedValue(null),
    setItemWithExpiry: vi.fn().mockResolvedValue("OK"),
    ttl: vi.fn().mockResolvedValue(-1),
    incrementByWithExpiry: vi.fn().mockResolvedValue(1),
    deleteItem: vi.fn().mockResolvedValue(1),
    ...patch
  }) as Mocked<KeyStoreSlice>;

const makeUserDAL = (consecutiveFailedMfaAttempts: number) => {
  const updateById = vi.fn(async (id: string, data: Record<string, unknown>) => {
    if ("$incr" in data) return { id, email: null, isLocked: false, consecutiveFailedMfaAttempts };
    return { id, ...data };
  });
  const transaction = vi.fn(async (cb: (tx: unknown) => unknown) => cb({}));
  return { updateById, transaction };
};

const makeService = (keyStore: Mocked<KeyStoreSlice>, userDAL: ReturnType<typeof makeUserDAL> = makeUserDAL(1)) =>
  mfaLockoutServiceFactory({
    keyStore: keyStore as never,
    userDAL: userDAL as never,
    tokenService: { createTokenForUser: vi.fn().mockResolvedValue("token") } as never,
    smtpService: { sendMail: vi.fn().mockResolvedValue(undefined) } as never
  });

describe("mfaLockoutService.reserveStepUpMfaAttempt", () => {
  test("allows an attempt while at or below the cap", async () => {
    const keyStore = makeKeyStore({ incrementByWithExpiry: vi.fn().mockResolvedValue(5) });
    const service = makeService(keyStore);

    await expect(service.reserveStepUpMfaAttempt(USER_ID)).resolves.toBeUndefined();
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
    expect(keyStore.deleteItem).not.toHaveBeenCalled();
  });

  test("engages the lockout and clears the counter once the cap is exceeded", async () => {
    const keyStore = makeKeyStore({ incrementByWithExpiry: vi.fn().mockResolvedValue(6) });
    const service = makeService(keyStore);

    await expect(service.reserveStepUpMfaAttempt(USER_ID)).rejects.toBeInstanceOf(ForbiddenRequestError);
    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      KeyStorePrefixes.UserStepUpMfaLockout(USER_ID),
      expect.any(Number),
      "1"
    );
    expect(keyStore.deleteItem).toHaveBeenCalledWith(KeyStorePrefixes.UserStepUpMfaAttempts(USER_ID));
  });
});

describe("mfaLockoutService.enforceStepUpMfaLockStatus", () => {
  test("passes when no lockout window is active", async () => {
    const service = makeService(makeKeyStore({ ttl: vi.fn().mockResolvedValue(-1) }));
    await expect(service.enforceStepUpMfaLockStatus(USER_ID)).resolves.toBeUndefined();
  });

  test("rejects with a minutes message while the window is active", async () => {
    const service = makeService(makeKeyStore({ ttl: vi.fn().mockResolvedValue(120) }));
    await expect(service.enforceStepUpMfaLockStatus(USER_ID)).rejects.toThrow(/2 minutes/);
  });

  test("rejects with a seconds message for a sub-minute window", async () => {
    const service = makeService(makeKeyStore({ ttl: vi.fn().mockResolvedValue(45) }));
    await expect(service.enforceStepUpMfaLockStatus(USER_ID)).rejects.toThrow(/45 seconds/);
  });
});

describe("mfaLockoutService recent-auth is bound to the session, not the user", () => {
  test("records under a key namespaced by both userId and tokenVersionId", async () => {
    const keyStore = makeKeyStore();
    const service = makeService(keyStore);

    await service.recordRecentMfaAuth(USER_ID, "session-a");

    expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
      KeyStorePrefixes.RecentMfaAuth(USER_ID, "session-a"),
      expect.any(Number),
      "1"
    );
  });

  test("a different session does not see another session's recent auth", async () => {
    const keyStore = makeKeyStore({
      getItem: vi.fn(async (key: string) => (key === KeyStorePrefixes.RecentMfaAuth(USER_ID, "session-a") ? "1" : null))
    });
    const service = makeService(keyStore);

    await expect(service.hasRecentMfaAuth(USER_ID, "session-a")).resolves.toBe(true);
    await expect(service.hasRecentMfaAuth(USER_ID, "session-b")).resolves.toBe(false);
  });
});

describe("mfaLockoutService.handleFailedMfaAttempt progressive lockout", () => {
  test.each([
    [5, 5],
    [10, 30],
    [15, 60]
  ])("applies a temporary lock at %i consecutive failures (%i min)", async (count, minutes) => {
    const now = new Date("2026-07-12T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const userDAL = makeUserDAL(count);
    const service = makeService(makeKeyStore(), userDAL);

    await service.handleFailedMfaAttempt(USER_ID);

    const lockUpdate = userDAL.updateById.mock.calls.find(([, data]) => "temporaryLockDateEnd" in data);
    expect(lockUpdate?.[1].temporaryLockDateEnd).toEqual(new Date(now.getTime() + minutes * 60 * 1000));
    expect(lockUpdate?.[1].isLocked).toBeUndefined();

    vi.useRealTimers();
  });

  test("permanently locks the account once the delays are exhausted", async () => {
    const userDAL = makeUserDAL(20);
    const service = makeService(makeKeyStore(), userDAL);

    await service.handleFailedMfaAttempt(USER_ID);

    const lockUpdate = userDAL.updateById.mock.calls.find(([, data]) => data.isLocked === true);
    expect(lockUpdate?.[1]).toMatchObject({ isLocked: true, temporaryLockDateEnd: null });
  });

  test("does not lock on a non-interval failure count", async () => {
    const userDAL = makeUserDAL(3);
    const service = makeService(makeKeyStore(), userDAL);

    await service.handleFailedMfaAttempt(USER_ID);

    // only the $incr call happened; no lock/delay update
    expect(userDAL.updateById).toHaveBeenCalledTimes(1);
  });
});
