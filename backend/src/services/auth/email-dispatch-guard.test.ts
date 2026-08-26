import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, type Mocked, test, vi } from "vitest";

import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, RateLimitError } from "@app/lib/errors";

import { emailDispatchGuardFactory, EmailDispatchPurpose } from "./email-dispatch-guard";

const AUTH_SECRET = "test-secret-for-email-dispatch-unit-tests";
const NOW_MS = 1_700_000_000_000;

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ AUTH_SECRET })
}));

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const hmac = (value: string) => createHmac("sha256", AUTH_SECRET).update(value).digest("hex");

type KeyStoreSlice = Pick<
  TKeyStoreFactory,
  | "setItemWithExpiryNX"
  | "ttl"
  | "incrementByAndRefreshExpiryIfUnderLimit"
  | "deleteItemsByKeyIn"
  | "probeDistinctMember"
>;

type MockedKeyStore = Mocked<KeyStoreSlice>;

const setup = () => {
  const keyStore = {
    setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
    ttl: vi.fn().mockResolvedValue(-1),
    incrementByAndRefreshExpiryIfUnderLimit: vi.fn().mockResolvedValue(1),
    deleteItemsByKeyIn: vi.fn().mockResolvedValue(2),
    probeDistinctMember: vi.fn().mockResolvedValue(true)
  } as MockedKeyStore;

  return { keyStore, guard: emailDispatchGuardFactory({ keyStore: keyStore as never }) };
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

describe("emailDispatchGuard", () => {
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

  describe("hashAddress", () => {
    test("keys the code on the literal address and the throttles on the mailbox", () => {
      const { guard } = setup();

      const { emailHash, mailboxHash } = guard.hashAddress("dave+work@infisical.example");

      expect(emailHash).toBe(hmac("dave+work@infisical.example"));
      expect(mailboxHash).toBe(hmac("dave@infisical.example"));
    });

    test("dots survive outside Google, where they distinguish real people", () => {
      const { guard } = setup();

      expect(guard.hashAddress("first.last@company.com").mailboxHash).toBe(hmac("first.last@company.com"));
      expect(guard.hashAddress("first.last@company.com").mailboxHash).not.toBe(hmac("firstlast@company.com"));
    });
  });

  describe("acquireMailboxCooldown", () => {
    // The signup bombing campaign varied dots and +tags; account recovery was reachable by varying
    // case alone, since its lookup lowercased the address while its rate-limit key did not. Both
    // collapse onto one bucket here or the cooldown is bypassable by changing a single character.
    test.each([
      ["t.a.y.l.or.qu.i.n.n.5.1.2+8bc4e8@googlemail.com", "taylorquinn512@gmail.com"],
      ["taylor.qui.nn512+4fb26f@gmail.com", "taylorquinn512@gmail.com"],
      ["TAYLORQUINN512@gmail.com", "taylorquinn512@gmail.com"],
      ["DAVE@infisical.example", "dave@infisical.example"],
      ["Dave+reset@infisical.Example", "dave@infisical.example"]
    ])("%s shares the bucket of %s", async (variant, mailbox) => {
      const { keyStore, guard } = setup();

      await guard.acquireMailboxCooldown({ purpose: EmailDispatchPurpose.Signup, email: variant });

      expect(keyStore.setItemWithExpiryNX).toHaveBeenCalledWith(
        KeyStorePrefixes.EmailDispatchCooldown(EmailDispatchPurpose.Signup, hmac(mailbox)),
        KeyStoreTtls.EmailDispatchCooldownInSeconds,
        "1"
      );
    });

    test("signup and recovery do not share a bucket", async () => {
      const { keyStore, guard } = setup();

      await guard.acquireMailboxCooldown({ purpose: EmailDispatchPurpose.Signup, email: "dave@infisical.example" });
      await guard.acquireMailboxCooldown({
        purpose: EmailDispatchPurpose.AccountRecovery,
        email: "dave@infisical.example"
      });

      const keys = keyStore.setItemWithExpiryNX.mock.calls.map(([key]) => key);
      expect(new Set(keys).size).toBe(2);
    });

    test("reports remaining TTL when the cooldown is active", async () => {
      const { keyStore, guard } = setup();
      keyStore.setItemWithExpiryNX.mockResolvedValue(null);
      keyStore.ttl.mockResolvedValue(30);

      const err = await expectRejected(
        guard.acquireMailboxCooldown({ purpose: EmailDispatchPurpose.Signup, email: "dave@infisical.example" }),
        BadRequestError
      );

      expect(err.details).toMatchObject({ cooldownSeconds: 30 });
    });

    test("clamps remaining TTL to a minimum of 1", async () => {
      const { keyStore, guard } = setup();
      keyStore.setItemWithExpiryNX.mockResolvedValue(null);
      keyStore.ttl.mockResolvedValue(-1);

      const err = await expectRejected(
        guard.acquireMailboxCooldown({ purpose: EmailDispatchPurpose.Signup, email: "dave@infisical.example" }),
        BadRequestError
      );

      expect(err.details).toMatchObject({ cooldownSeconds: 1 });
    });
  });

  describe("consumeMailboxAllowance", () => {
    const mailboxHash = hmac("dave@infisical.example");
    const args = { purpose: EmailDispatchPurpose.Signup, mailboxHash };

    test("allows a send while under the cap", async () => {
      const { keyStore, guard } = setup();
      keyStore.incrementByAndRefreshExpiryIfUnderLimit.mockResolvedValueOnce(5);

      await expect(guard.consumeMailboxAllowance(args)).resolves.toBe(true);
    });

    test("refuses once the cap is reached", async () => {
      const { keyStore, guard } = setup();
      keyStore.incrementByAndRefreshExpiryIfUnderLimit.mockResolvedValueOnce(-1);

      await expect(guard.consumeMailboxAllowance(args)).resolves.toBe(false);
    });

    test("uses the primitive that does not extend the window on refusal", async () => {
      const { keyStore, guard } = setup();

      await guard.consumeMailboxAllowance(args);

      expect(keyStore.incrementByAndRefreshExpiryIfUnderLimit).toHaveBeenCalledWith(
        KeyStorePrefixes.EmailDispatchMailboxSends(EmailDispatchPurpose.Signup, mailboxHash),
        5,
        KeyStoreTtls.EmailDispatchMailboxWindowInSeconds
      );
    });
  });

  describe("consumeSourceAllowance", () => {
    const args = { purpose: EmailDispatchPurpose.Signup, ip: "203.0.113.7" };

    test("hashes the source address before it reaches the store", async () => {
      const { keyStore, guard } = setup();

      await guard.consumeSourceAllowance(args);

      const [key] = keyStore.incrementByAndRefreshExpiryIfUnderLimit.mock.calls[0];
      expect(key).toContain(hmac("203.0.113.7"));
      expect(key).not.toContain("203.0.113.7");
    });

    test("admits a busy shared address while under the cap", async () => {
      const { keyStore, guard } = setup();
      keyStore.incrementByAndRefreshExpiryIfUnderLimit.mockResolvedValueOnce(20);

      await expect(guard.consumeSourceAllowance(args)).resolves.toBeUndefined();
    });

    test("refuses loudly once the cap is reached", async () => {
      const { keyStore, guard } = setup();
      keyStore.incrementByAndRefreshExpiryIfUnderLimit.mockResolvedValueOnce(-1);

      await expectRejected(guard.consumeSourceAllowance(args), RateLimitError);
    });

    test("uses the primitive that does not extend the window on refusal", async () => {
      const { keyStore, guard } = setup();

      await guard.consumeSourceAllowance(args);

      const [, limit, ttl] = keyStore.incrementByAndRefreshExpiryIfUnderLimit.mock.calls[0];
      expect(limit).toBe(20);
      expect(ttl).toBe(KeyStoreTtls.EmailDispatchSourceWindowInSeconds);
    });
  });

  describe("clearMailboxThrottle", () => {
    test("drops both the cooldown and the send counter for that purpose", async () => {
      const { keyStore, guard } = setup();
      const mailboxHash = hmac("dave@infisical.example");

      await guard.clearMailboxThrottle({ purpose: EmailDispatchPurpose.AccountRecovery, mailboxHash });

      expect(keyStore.deleteItemsByKeyIn).toHaveBeenCalledWith([
        KeyStorePrefixes.EmailDispatchCooldown(EmailDispatchPurpose.AccountRecovery, mailboxHash),
        KeyStorePrefixes.EmailDispatchMailboxSends(EmailDispatchPurpose.AccountRecovery, mailboxHash)
      ]);
    });
  });

  describe("probeTraffic", () => {
    test("stores only HMACs, never the address or the IP", async () => {
      const { keyStore, guard } = setup();

      await guard.probeTraffic({
        purpose: EmailDispatchPurpose.Signup,
        mailboxHash: hmac("dave@infisical.example"),
        ip: "203.0.113.7"
      });

      const members = keyStore.probeDistinctMember.mock.calls.map(([, member]) => member);
      expect(members).toContain(hmac("203.0.113.7"));
      expect(members).not.toContain("203.0.113.7");
      expect(members).not.toContain("dave@infisical.example");
    });
  });
});
