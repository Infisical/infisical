import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type Mocked, test, vi } from "vitest";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError, UnauthorizedError } from "@app/lib/errors";

import { tokenServiceFactory } from "./auth-token-service";
import { TEmailSignupOtpPayload } from "./auth-token-types";

const AUTH_SECRET = "test-secret-for-otp-unit-tests";
const NOW_MS = 1_700_000_000_000;
const TEST_EMAIL = "otp-test@example.com";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ AUTH_SECRET })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const hmac = (value: string) => createHmac("sha256", AUTH_SECRET).update(value).digest("hex");

const emailHash = hmac(TEST_EMAIL);
const otpKey = KeyStorePrefixes.EmailSignupOtpHash(emailHash);

type KeyStoreSlice = Pick<
  TKeyStoreFactory,
  "setItemWithExpiry" | "setItemWithExpiryNX" | "getItem" | "deleteItem" | "acquireLock" | "deleteItemsByKeyIn" | "ttl"
>;

type MockedKeyStore = Mocked<KeyStoreSlice>;

const makeKeyStore = (patch: Partial<MockedKeyStore> = {}): MockedKeyStore =>
  ({
    setItemWithExpiry: vi.fn().mockResolvedValue("OK"),
    setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
    getItem: vi.fn().mockResolvedValue(null),
    deleteItem: vi.fn().mockResolvedValue(1),
    acquireLock: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) }),
    deleteItemsByKeyIn: vi.fn().mockResolvedValue(2),
    ttl: vi.fn().mockResolvedValue(-1),
    ...patch
  }) as MockedKeyStore;

const createService = (keyStore: MockedKeyStore) => {
  const service = tokenServiceFactory({
    tokenDAL: {} as never,
    userDAL: {} as never,
    orgDAL: {} as never,
    membershipUserDAL: {} as never,
    keyStore: keyStore as never
  });

  return { service, keyStore };
};

const setup = () => {
  const keyStore = makeKeyStore();
  const { service } = createService(keyStore);

  return {
    service,
    keyStore,

    mockOtp(payload: Partial<TEmailSignupOtpPayload> = {}) {
      keyStore.getItem.mockResolvedValue(
        JSON.stringify({
          tokenHash: hmac("123456"),
          triesLeft: 3,
          expiresAt: NOW_MS + 300_000,
          ...payload
        })
      );
      return this;
    },

    mockCooldown(ttl: number, present = true) {
      keyStore.setItemWithExpiryNX.mockResolvedValue(present ? null : "OK");
      keyStore.ttl.mockResolvedValue(ttl);
      return this;
    },

    mockNoOtp() {
      keyStore.getItem.mockResolvedValue(null);
      return this;
    }
  };
};

const getStoredOtpPayload = (keyStore: MockedKeyStore) => {
  const stored = keyStore.setItemWithExpiry.mock.calls.find(([k]) => k === otpKey)?.[2];
  return stored ? (JSON.parse(stored as string) as TEmailSignupOtpPayload) : null;
};

const expectRejected = async <T, E extends Error>(
  promise: Promise<T>,
  ErrorType: new (...args: never[]) => E
): Promise<E> => {
  try {
    await promise;
    throw new Error("Expected rejection");
  } catch (e) {
    expect(e).toBeInstanceOf(ErrorType);
    return e as E;
  }
};

describe("tokenServiceFactory — email signup OTP", () => {
  beforeAll(async () => {
    process.env.FIPS_ENABLED = "false";
    await crypto.initialize({} as never, {} as never, {} as never);
  });

  afterAll(() => {
    delete process.env.FIPS_ENABLED;
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("createEmailSignupToken", () => {
    test("returns a six-digit numeric token", async () => {
      const { service } = setup();

      const token = await service.createEmailSignupToken(emailHash);

      expect(token).toMatch(/^\d{6}$/);
    });

    test("stores OTP payload with hashed token and 3 tries", async () => {
      const { service, keyStore } = setup();

      const token = await service.createEmailSignupToken(emailHash);

      const payload = getStoredOtpPayload(keyStore);
      expect(payload?.tokenHash).toBe(hmac(token));
      expect(payload?.triesLeft).toBe(3);
    });

    test("stores OTP with correct expiry", async () => {
      const { service, keyStore } = setup();

      await service.createEmailSignupToken(emailHash);

      const payload = getStoredOtpPayload(keyStore);
      expect(payload?.expiresAt).toBe(NOW_MS + KeyStoreTtls.EmailSignupOtpInSeconds * 1000);
    });

    test("writes to the OTP key with the correct TTL", async () => {
      const { service, keyStore } = setup();

      await service.createEmailSignupToken(emailHash);

      expect(keyStore.setItemWithExpiry).toHaveBeenCalledWith(
        otpKey,
        KeyStoreTtls.EmailSignupOtpInSeconds,
        expect.any(String)
      );
    });

    test("does not touch the cooldown key", async () => {
      const { service, keyStore } = setup();

      await service.createEmailSignupToken(emailHash);

      expect(keyStore.setItemWithExpiryNX).not.toHaveBeenCalled();
    });
  });

  describe("validateEmailSignupToken", () => {
    test("valid token succeeds", async () => {
      const { service } = setup().mockOtp();

      await expect(service.validateEmailSignupToken(TEST_EMAIL, "123456")).resolves.toBeUndefined();
    });

    test("deletes the OTP on success", async () => {
      const { service, keyStore } = setup().mockOtp();

      await service.validateEmailSignupToken(TEST_EMAIL, "123456");

      expect(keyStore.deleteItem).toHaveBeenCalledWith(otpKey);
    });

    test("throws when OTP missing", async () => {
      const { service } = setup().mockNoOtp();

      await expectRejected(service.validateEmailSignupToken(TEST_EMAIL, "123456"), UnauthorizedError);
    });

    test("expires OTP deletes key", async () => {
      const { service, keyStore } = setup().mockOtp({
        expiresAt: NOW_MS - 1
      });

      await expectRejected(service.validateEmailSignupToken(TEST_EMAIL, "123456"), UnauthorizedError);

      expect(keyStore.deleteItem).toHaveBeenCalledWith(otpKey);
    });

    test("wrong code decrements tries", async () => {
      const { service, keyStore } = setup().mockOtp({ triesLeft: 3 });

      await expectRejected(service.validateEmailSignupToken(TEST_EMAIL, "000000"), UnauthorizedError);

      const payload = getStoredOtpPayload(keyStore);
      expect(payload?.triesLeft).toBe(2);
    });

    test("last try deletes OTP", async () => {
      const { service, keyStore } = setup().mockOtp({ triesLeft: 1 });

      await expectRejected(service.validateEmailSignupToken(TEST_EMAIL, "000000"), UnauthorizedError);

      expect(keyStore.deleteItem).toHaveBeenCalledWith(otpKey);
      expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
    });

    test("lock is always released", async () => {
      const release = vi.fn().mockResolvedValue(undefined);
      const keyStore = makeKeyStore({
        acquireLock: vi.fn().mockResolvedValue({ release } as never)
      });
      const { service } = createService(keyStore);

      await expectRejected(service.validateEmailSignupToken(TEST_EMAIL, "123456"), UnauthorizedError);

      expect(release).toHaveBeenCalledOnce();
    });
  });
});

describe("tokenServiceFactory — org scope of user tokens", () => {
  const USER_ID = "user-1";
  const ROOT = "root-org";
  const SUB = "sub-org";
  const OTHER_ROOT = "other-root-org";
  const SESSION = { id: "session-1", userId: USER_ID, accessVersion: 1, refreshVersion: 1 };

  const orgs: Record<string, { id: string; name: string; rootOrgId: string | null; parentOrgId: string | null }> = {
    [ROOT]: { id: ROOT, name: "Root", rootOrgId: null, parentOrgId: null },
    [SUB]: { id: SUB, name: "Sub", rootOrgId: ROOT, parentOrgId: ROOT },
    [OTHER_ROOT]: { id: OTHER_ROOT, name: "Other", rootOrgId: null, parentOrgId: null }
  };

  const build = ({
    session = SESSION as typeof SESSION | null,
    user = { id: USER_ID, isAccepted: true, isLocked: false, temporaryLockDateEnd: null as Date | null } as {
      id: string;
      isAccepted: boolean;
      isLocked: boolean;
      temporaryLockDateEnd: Date | null;
    } | null,
    memberships = { [ROOT]: true, [SUB]: true } as Record<
      string,
      boolean | { isActive: boolean; status: string } | undefined
    >
  } = {}) => {
    const orgDAL = {
      findOne: vi.fn(async ({ id }: { id: string }) => orgs[id]),
      // Mirrors the DAL: a status filter hides rows in any other status unless acceptAnyStatus is set.
      findEffectiveOrgMembership: vi.fn(
        async ({ orgId, status, acceptAnyStatus }: { orgId: string; status?: string; acceptAnyStatus?: boolean }) => {
          const entry = memberships[orgId];
          if (entry === undefined) return null;
          const row = typeof entry === "boolean" ? { isActive: entry, status: "accepted" } : entry;
          if (!acceptAnyStatus && status && row.status !== status) return null;
          return row;
        }
      )
    };
    const service = tokenServiceFactory({
      tokenDAL: { findOneTokenSession: vi.fn().mockResolvedValue(session) } as never,
      userDAL: { findById: vi.fn().mockResolvedValue(user) } as never,
      orgDAL: orgDAL as never,
      membershipUserDAL: {} as never,
      keyStore: makeKeyStore() as never
    });
    return { service, orgDAL };
  };

  const accessToken = (claims: { organizationId?: string; subOrganizationId?: string }) =>
    ({ userId: USER_ID, tokenVersionId: SESSION.id, accessVersion: 1, ...claims }) as never;
  const refreshToken = (claims: { organizationId?: string; subOrganizationId?: string }) =>
    ({ userId: USER_ID, tokenVersionId: SESSION.id, refreshVersion: 1, ...claims }) as never;

  afterEach(() => vi.clearAllMocks());

  test("a sub-org token resolves to the sub-org when root and sub-org memberships are active", async () => {
    const { service } = build();
    const identity = await service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB }));
    expect(identity).toMatchObject({ orgId: SUB, orgName: "Sub", rootOrgId: ROOT, parentOrgId: ROOT });
  });

  test("a sub-org token is refused when the root membership is inactive", async () => {
    const { service } = build({ memberships: { [ROOT]: false, [SUB]: true } });
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB })),
      ForbiddenRequestError
    );
    expect(err.message).toContain("inactive");
  });

  test("a sub-org token is refused when the root membership is gone", async () => {
    const { service } = build({ memberships: { [SUB]: true } });
    await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB })),
      ForbiddenRequestError
    );
  });

  test("a sub-org token is refused when the sub-org membership is inactive", async () => {
    const { service } = build({ memberships: { [ROOT]: true, [SUB]: false } });
    await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB })),
      ForbiddenRequestError
    );
  });

  test("subOrganizationId equal to organizationId is refused", async () => {
    const { service, orgDAL } = build();
    await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: ROOT })),
      ForbiddenRequestError
    );
    expect(orgDAL.findEffectiveOrgMembership).not.toHaveBeenCalled();
  });

  test("a sub-org under a different root is refused", async () => {
    const { service } = build();
    await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: OTHER_ROOT, subOrganizationId: SUB })),
      ForbiddenRequestError
    );
  });

  // UnauthorizedError, not NotFoundError: clients only treat a 401 as "log in again", and a 404 reads as a missing resource.
  // Every such case shares one public name and message; only `detail`, which is logged and never sent, tells them apart.
  test("a token whose session no longer exists is refused with UnauthorizedError", async () => {
    const { service } = build({ session: null });
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT })),
      UnauthorizedError
    );
    expect(err).toMatchObject({ name: "InvalidToken", detail: { reasonCode: "session_not_found" } });
  });

  test("a token issued before its session was invalidated is refused with UnauthorizedError", async () => {
    const { service } = build({ session: { ...SESSION, accessVersion: 2 } });
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT })),
      UnauthorizedError
    );
    expect(err).toMatchObject({ name: "InvalidToken", detail: { reasonCode: "session_stale" } });
  });

  test("a token whose user no longer exists is refused with UnauthorizedError", async () => {
    const { service } = build({ user: null });
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT })),
      UnauthorizedError
    );
    expect(err).toMatchObject({ name: "InvalidToken", detail: { reasonCode: "user_unavailable" } });
  });

  test("a token whose user is not accepted is refused with UnauthorizedError", async () => {
    const { service } = build({
      user: { id: USER_ID, isAccepted: false, isLocked: false, temporaryLockDateEnd: null }
    });
    await expectRejected(service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT })), UnauthorizedError);
  });

  test("subOrganizationId without organizationId is refused", async () => {
    const { service } = build();
    await expectRejected(service.fnValidateJwtIdentity(accessToken({ subOrganizationId: SUB })), UnauthorizedError);
  });

  test("a token with no org claims stays valid and unscoped", async () => {
    const { service, orgDAL } = build();
    const identity = await service.fnValidateJwtIdentity(accessToken({}));
    expect(identity).toMatchObject({ orgId: "", rootOrgId: "" });
    expect(orgDAL.findOne).not.toHaveBeenCalled();
  });

  test("a token for an org that no longer exists is refused with 401, not a 500", async () => {
    const { service } = build();
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: "deleted-org" })),
      UnauthorizedError
    );
    expect(err.message).toContain("deleted-org");
  });

  // selectOrganization issues a sub-org token to a still-Invited root member and only promotes on root selection.
  test("a sub-org token is accepted while the root membership is still Invited but active", async () => {
    const { service } = build({ memberships: { [ROOT]: { isActive: true, status: "invited" }, [SUB]: true } });
    await expect(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB }))
    ).resolves.toMatchObject({ orgId: SUB });
    await expect(
      service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT, subOrganizationId: SUB }))
    ).resolves.toBeUndefined();
  });

  test("a sub-org token is refused when the Invited root membership is deactivated", async () => {
    const { service } = build({ memberships: { [ROOT]: { isActive: false, status: "invited" }, [SUB]: true } });
    await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: SUB })),
      ForbiddenRequestError
    );
  });

  test("a root-scoped token still requires an Accepted root membership", async () => {
    const { service } = build({ memberships: { [ROOT]: { isActive: true, status: "invited" } } });
    await expectRejected(service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT })), ForbiddenRequestError);
  });

  test("a token for a sub-org that no longer exists is refused with 401, not a 400", async () => {
    const { service } = build();
    const err = await expectRejected(
      service.fnValidateJwtIdentity(accessToken({ organizationId: ROOT, subOrganizationId: "deleted-sub" })),
      UnauthorizedError
    );
    expect(err.message).toContain("deleted-sub");
    await expectRejected(
      service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT, subOrganizationId: "deleted-sub" })),
      UnauthorizedError
    );
  });

  describe("validateRefreshTokenAccess", () => {
    test("allows an active, unlocked member", async () => {
      const { service } = build();
      await expect(
        service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT, subOrganizationId: SUB }))
      ).resolves.toBeUndefined();
    });

    test("refuses when the root membership is inactive", async () => {
      const { service } = build({ memberships: { [ROOT]: false, [SUB]: true } });
      await expectRejected(
        service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT, subOrganizationId: SUB })),
        ForbiddenRequestError
      );
    });

    test("refuses a permanently locked user, even without an org claim", async () => {
      const { service, orgDAL } = build({
        user: { id: USER_ID, isAccepted: true, isLocked: true, temporaryLockDateEnd: null }
      });
      const err = await expectRejected(service.validateRefreshTokenAccess(refreshToken({})), UnauthorizedError);
      expect(err.message).toBe("Account is locked");
      expect(orgDAL.findEffectiveOrgMembership).not.toHaveBeenCalled();
    });

    test("refuses a temporarily locked user until the lock expires", async () => {
      const lockedUntil = new Date(Date.now() + 60_000);
      const locked = build({
        user: { id: USER_ID, isAccepted: true, isLocked: false, temporaryLockDateEnd: lockedUntil }
      });
      await expectRejected(
        locked.service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT })),
        UnauthorizedError
      );

      const expired = build({
        user: { id: USER_ID, isAccepted: true, isLocked: false, temporaryLockDateEnd: new Date(Date.now() - 60_000) }
      });
      await expect(
        expired.service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT }))
      ).resolves.toBeUndefined();
    });

    // UnauthorizedError, not NotFoundError: the OAuth token endpoint maps NotFound to server_error.
    test("refuses a user who is not accepted with UnauthorizedError", async () => {
      const { service } = build({
        user: { id: USER_ID, isAccepted: false, isLocked: false, temporaryLockDateEnd: null }
      });
      await expectRejected(
        service.validateRefreshTokenAccess(refreshToken({ organizationId: ROOT })),
        UnauthorizedError
      );
    });

    test("refuses a refresh token scoped to an org that no longer exists with UnauthorizedError", async () => {
      const { service } = build();
      await expectRejected(
        service.validateRefreshTokenAccess(refreshToken({ organizationId: "deleted-org" })),
        UnauthorizedError
      );
    });
  });
});
