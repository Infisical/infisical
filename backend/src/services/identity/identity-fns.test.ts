import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes } from "@app/keystore/keystore";

import {
  clearIdentityLockoutsForAuthMethod,
  clearIdentityLockoutState,
  getIdentityActiveLockoutAuthMethods,
  getIdentityLockoutState,
  persistIdentityLockoutState
} from "./identity-fns";

const IDENTITY_ID = "6f7c1b6a-6e6f-4c0e-9f1a-2c2f5b8d9e01";
const HASH_KEY = KeyStorePrefixes.IdentityLockoutStateHash(IDENTITY_ID);

const lockedOut = (expiresAt?: number) => JSON.stringify({ lockedOut: true, failedAttempts: 5, expiresAt });
const notLockedOut = () => JSON.stringify({ lockedOut: false, failedAttempts: 1 });

const makeKeyStore = (hash: Record<string, string>) => ({
  hashGetAll: vi.fn().mockResolvedValue(hash),
  hashGetAllPrimary: vi.fn().mockResolvedValue(hash),
  hashGet: vi.fn().mockResolvedValue(null),
  hashDeleteFields: vi.fn().mockResolvedValue(0),
  hashSetFieldWithMinExpiry: vi.fn().mockResolvedValue(undefined),
  setItemWithExpiry: vi.fn().mockResolvedValue(undefined),
  deleteItem: vi.fn().mockResolvedValue(1),
  deleteItemsByKeyIn: vi.fn().mockResolvedValue(0),
  getKeysByPattern: vi.fn(),
  getItem: vi.fn()
});

describe("getIdentityActiveLockoutAuthMethods", () => {
  test("returns only the auth methods whose state is locked out", async () => {
    const keyStore = makeKeyStore({
      [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: lockedOut(),
      [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: notLockedOut()
    });

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.UNIVERSAL_AUTH
    ]);
    expect(keyStore.hashGetAll).toHaveBeenCalledWith(HASH_KEY);
  });

  test("never scans the keyspace", async () => {
    const keyStore = makeKeyStore({ [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: lockedOut() });

    await getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore);

    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
    expect(keyStore.getItem).not.toHaveBeenCalled();
    expect(keyStore.hashGetAll).toHaveBeenCalledTimes(1);
  });

  test("de-duplicates an auth method locked out under several slugs", async () => {
    const keyStore = makeKeyStore({
      [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: lockedOut(),
      [`${IdentityAuthMethod.LDAP_AUTH}:bob`]: lockedOut()
    });

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });

  test("returns an empty list for an empty hash and for a missing key", async () => {
    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, makeKeyStore({}))).resolves.toEqual([]);

    const missing = { ...makeKeyStore({}), hashGetAll: vi.fn().mockResolvedValue(null) };
    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, missing)).resolves.toEqual([]);
  });

  test("drops a field whose own deadline has passed", async () => {
    const keyStore = makeKeyStore({
      [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: lockedOut(Date.now() - 1_000),
      [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: lockedOut(Date.now() + 60_000)
    });

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });

  test("skips unparseable and malformed fields instead of throwing", async () => {
    const keyStore = makeKeyStore({
      "not-a-field": lockedOut(),
      [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: "{{{",
      [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: lockedOut()
    });

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });
});

describe("getIdentityLockoutState", () => {
  const selector = { identityId: IDENTITY_ID, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a" };

  test("reads the one field it needs, never the whole hash or a string key", async () => {
    const keyStore = { ...makeKeyStore({}), hashGet: vi.fn().mockResolvedValue(lockedOut()) };

    await expect(getIdentityLockoutState(selector, keyStore)).resolves.toMatchObject({ lockedOut: true });
    expect(keyStore.hashGet).toHaveBeenCalledWith(HASH_KEY, `${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`);
    expect(keyStore.getItem).not.toHaveBeenCalled();
    expect(keyStore.hashGetAll).not.toHaveBeenCalled();
  });

  test("treats a field past its own deadline as absent", async () => {
    const keyStore = { ...makeKeyStore({}), hashGet: vi.fn().mockResolvedValue(lockedOut(Date.now() - 1_000)) };
    await expect(getIdentityLockoutState(selector, keyStore)).resolves.toBeUndefined();
  });

  test("keeps a field whose deadline is still ahead", async () => {
    const keyStore = { ...makeKeyStore({}), hashGet: vi.fn().mockResolvedValue(lockedOut(Date.now() + 60_000)) };
    await expect(getIdentityLockoutState(selector, keyStore)).resolves.toMatchObject({ lockedOut: true });
  });

  test("returns undefined for a missing or unreadable field", async () => {
    const missing = { ...makeKeyStore({}), hashGet: vi.fn().mockResolvedValue(null) };
    await expect(getIdentityLockoutState(selector, missing)).resolves.toBeUndefined();

    const corrupt = { ...makeKeyStore({}), hashGet: vi.fn().mockResolvedValue("{{{") };
    await expect(getIdentityLockoutState(selector, corrupt)).resolves.toBeUndefined();
  });
});

describe("persistIdentityLockoutState", () => {
  test("writes the hash field only, stamped with its own deadline", async () => {
    const keyStore = makeKeyStore({});

    await persistIdentityLockoutState(
      {
        identityId: IDENTITY_ID,
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        slug: "client-a",
        expiryInSeconds: 300
      },
      { lockedOut: true, failedAttempts: 3 },
      keyStore
    );

    const [hashKey, field, payload, hashTtl] = keyStore.hashSetFieldWithMinExpiry.mock.calls[0] as [
      string,
      string,
      string,
      number
    ];

    expect(hashKey).toBe(HASH_KEY);
    expect(field).toBe(`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`);
    expect(hashTtl).toBe(300);
    expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();

    const parsed = JSON.parse(payload) as { lockedOut: boolean; failedAttempts: number; expiresAt: number };
    expect(parsed.lockedOut).toBe(true);
    expect(parsed.failedAttempts).toBe(3);
    expect(parsed.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("clearIdentityLockoutState", () => {
  test("removes the hash field and touches no string key", async () => {
    const keyStore = makeKeyStore({});

    await clearIdentityLockoutState(
      { identityId: IDENTITY_ID, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" },
      keyStore
    );

    expect(keyStore.hashDeleteFields).toHaveBeenCalledWith(HASH_KEY, [`${IdentityAuthMethod.LDAP_AUTH}:alice`]);
    expect(keyStore.deleteItem).not.toHaveBeenCalled();
  });
});

describe("clearIdentityLockoutsForAuthMethod", () => {
  test("clears only the requested method's fields", async () => {
    const keyStore = makeKeyStore({
      [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: lockedOut(),
      [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: lockedOut(),
      [`${IdentityAuthMethod.LDAP_AUTH}:bob`]: notLockedOut()
    });
    keyStore.hashDeleteFields.mockResolvedValue(2);

    await expect(clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore)).resolves.toBe(
      2
    );

    expect(keyStore.hashDeleteFields).toHaveBeenCalledWith(HASH_KEY, [
      `${IdentityAuthMethod.LDAP_AUTH}:alice`,
      `${IdentityAuthMethod.LDAP_AUTH}:bob`
    ]);
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
    expect(keyStore.deleteItemsByKeyIn).not.toHaveBeenCalled();
  });

  test("decides what to delete from the primary, never a read replica", async () => {
    // A replica read can lag behind a lockout the primary already holds, and the delete driven off
    // it would leave that lockout in place after the admin asked to clear it.
    const keyStore = makeKeyStore({ [`${IdentityAuthMethod.LDAP_AUTH}:alice`]: lockedOut() });

    await clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore);

    expect(keyStore.hashGetAllPrimary).toHaveBeenCalledWith(HASH_KEY);
    expect(keyStore.hashGetAll).not.toHaveBeenCalled();
  });

  test("is a no-op when the identity has no lockouts for that method", async () => {
    const keyStore = makeKeyStore({ [`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]: lockedOut() });

    await expect(clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore)).resolves.toBe(
      0
    );

    expect(keyStore.deleteItemsByKeyIn).not.toHaveBeenCalled();
    expect(keyStore.hashDeleteFields).not.toHaveBeenCalled();
  });
});
