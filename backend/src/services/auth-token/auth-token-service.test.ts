import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type Mocked, test, vi } from "vitest";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";

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
const cooldownKey = KeyStorePrefixes.EmailSignupResendCooldown(emailHash);

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

  describe("acquireEmailSignupCooldown", () => {
    test("returns emailHash and cooldownSeconds on first call", async () => {
      const { service } = setup();

      const result = await service.acquireEmailSignupCooldown(TEST_EMAIL);

      expect(result.emailHash).toBe(emailHash);
      expect(result.cooldownSeconds).toBe(KeyStoreTtls.EmailSignupResendCooldownInSeconds);
    });

    test("sets cooldown key atomically via NX", async () => {
      const { service, keyStore } = setup();

      await service.acquireEmailSignupCooldown(TEST_EMAIL);

      expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledWith(
        cooldownKey,
        KeyStoreTtls.EmailSignupResendCooldownInSeconds,
        "1"
      );
    });

    test("throws when cooldown is active", async () => {
      const { service } = setup().mockCooldown(45);

      await expectRejected(service.acquireEmailSignupCooldown(TEST_EMAIL), BadRequestError);
    });

    test("reports remaining TTL in error details", async () => {
      const { service } = setup().mockCooldown(30);

      const err = await expectRejected(service.acquireEmailSignupCooldown(TEST_EMAIL), BadRequestError);

      expect(err.details).toMatchObject({ cooldownSeconds: 30 });
    });

    test("clamps remaining TTL to minimum 1", async () => {
      const { service } = setup().mockCooldown(-1);

      const err = await expectRejected(service.acquireEmailSignupCooldown(TEST_EMAIL), BadRequestError);

      expect(err.details).toMatchObject({ cooldownSeconds: 1 });
    });
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

    test("deletes OTP and cooldown on success", async () => {
      const { service, keyStore } = setup().mockOtp();

      await service.validateEmailSignupToken(TEST_EMAIL, "123456");

      expect(keyStore.deleteItemsByKeyIn).toHaveBeenCalledWith(expect.arrayContaining([otpKey, cooldownKey]));
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
