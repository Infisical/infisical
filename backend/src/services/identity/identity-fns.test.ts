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
const INDEX_KEY = KeyStorePrefixes.IdentityLockoutIndex(IDENTITY_ID);
const itemKey = (authMethod: string, slug: string) =>
  KeyStorePrefixes.IdentityLockoutState(IDENTITY_ID, authMethod, slug);

const makeKeyStore = () => ({
  getItem: vi.fn().mockResolvedValue(null),
  setIndexedItemWithExpiry: vi.fn().mockResolvedValue(undefined),
  deleteIndexedItems: vi.fn().mockResolvedValue(undefined),
  sortedSetRangeByScore: vi.fn().mockResolvedValue([]),
  sortedSetMembersPrimary: vi.fn().mockResolvedValue([]),
  getKeysByPattern: vi.fn(),
  deleteItems: vi.fn()
});

describe("getIdentityLockoutState", () => {
  const selector = { identityId: IDENTITY_ID, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a" };

  test("reads the one key it already knows, and never the index", async () => {
    const keyStore = makeKeyStore();
    keyStore.getItem.mockResolvedValue(JSON.stringify({ lockedOut: true, failedAttempts: 3 }));

    await expect(getIdentityLockoutState(selector, keyStore)).resolves.toEqual({
      lockedOut: true,
      failedAttempts: 3
    });
    expect(keyStore.getItem).toHaveBeenCalledWith(itemKey(IdentityAuthMethod.UNIVERSAL_AUTH, "client-a"));
    expect(keyStore.sortedSetRangeByScore).not.toHaveBeenCalled();
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("treats a missing key as no lockout, since the key's TTL is the expiry", async () => {
    await expect(getIdentityLockoutState(selector, makeKeyStore())).resolves.toBeUndefined();
  });

  test("treats an unreadable value as no lockout rather than failing the login", async () => {
    const keyStore = makeKeyStore();
    keyStore.getItem.mockResolvedValue("{{{");

    await expect(getIdentityLockoutState(selector, keyStore)).resolves.toBeUndefined();
  });
});

describe("getIdentityActiveLockoutAuthMethods", () => {
  test("ranges the index by score and reports the methods it names", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetRangeByScore.mockResolvedValue([
      `${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`,
      `${IdentityAuthMethod.LDAP_AUTH}:alice`
    ]);

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.UNIVERSAL_AUTH,
      IdentityAuthMethod.LDAP_AUTH
    ]);

    const [key, min, max] = keyStore.sortedSetRangeByScore.mock.calls[0] as [string, number, string];
    expect(key).toBe(INDEX_KEY);
    expect(max).toBe("+inf");
    // Filtering by score is what makes a member that outlived its key harmless.
    expect(min).toBeGreaterThan(0);
  });

  test("reads no item keys at all", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetRangeByScore.mockResolvedValue([`${IdentityAuthMethod.LDAP_AUTH}:alice`]);

    await getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore);

    expect(keyStore.getItem).not.toHaveBeenCalled();
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("reports a method locked under several slugs once", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetRangeByScore.mockResolvedValue([
      `${IdentityAuthMethod.LDAP_AUTH}:alice`,
      `${IdentityAuthMethod.LDAP_AUTH}:bob`
    ]);

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });

  test("returns an empty list for an identity with no index", async () => {
    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, makeKeyStore())).resolves.toEqual([]);
  });

  test("ignores a member with no method separator", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetRangeByScore.mockResolvedValue(["malformed", `${IdentityAuthMethod.LDAP_AUTH}:alice`]);

    await expect(getIdentityActiveLockoutAuthMethods(IDENTITY_ID, keyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });
});

describe("persistIdentityLockoutState", () => {
  test("indexes a lockout so the list endpoints can see it", async () => {
    const keyStore = makeKeyStore();

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

    expect(keyStore.setIndexedItemWithExpiry).toHaveBeenCalledWith({
      indexKey: INDEX_KEY,
      member: `${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`,
      itemKey: itemKey(IdentityAuthMethod.UNIVERSAL_AUTH, "client-a"),
      value: JSON.stringify({ lockedOut: true, failedAttempts: 3 }),
      expiryInSeconds: 300,
      indexed: true
    });
  });

  test("does not index a failure counter", async () => {
    // The list endpoints have no use for counters, and on LDAP their slug is caller-supplied. Keeping
    // them out of the index is what stops a username spray from enlarging that read.
    const keyStore = makeKeyStore();

    await persistIdentityLockoutState(
      { identityId: IDENTITY_ID, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice", expiryInSeconds: 30 },
      { lockedOut: false, failedAttempts: 1 },
      keyStore
    );

    expect(keyStore.setIndexedItemWithExpiry).toHaveBeenCalledWith(expect.objectContaining({ indexed: false }));
  });
});

describe("clearIdentityLockoutState", () => {
  test("removes the item and its index member together", async () => {
    const keyStore = makeKeyStore();

    await clearIdentityLockoutState(
      { identityId: IDENTITY_ID, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" },
      keyStore
    );

    // Dropping only the item would leave the index reporting a lockout that no longer exists.
    expect(keyStore.deleteIndexedItems).toHaveBeenCalledWith({
      indexKey: INDEX_KEY,
      members: [`${IdentityAuthMethod.LDAP_AUTH}:alice`],
      itemKeys: [itemKey(IdentityAuthMethod.LDAP_AUTH, "alice")]
    });
  });
});

describe("clearIdentityLockoutsForAuthMethod", () => {
  test("clears every locked slug for that method and no others", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetMembersPrimary.mockResolvedValue([
      `${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`,
      `${IdentityAuthMethod.LDAP_AUTH}:alice`,
      `${IdentityAuthMethod.LDAP_AUTH}:bob`
    ]);

    await expect(clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore)).resolves.toBe(
      2
    );

    expect(keyStore.deleteIndexedItems).toHaveBeenCalledWith({
      indexKey: INDEX_KEY,
      members: [`${IdentityAuthMethod.LDAP_AUTH}:alice`, `${IdentityAuthMethod.LDAP_AUTH}:bob`],
      itemKeys: [itemKey(IdentityAuthMethod.LDAP_AUTH, "alice"), itemKey(IdentityAuthMethod.LDAP_AUTH, "bob")]
    });
  });

  test("decides what to delete from the primary, never a read replica", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetMembersPrimary.mockResolvedValue([`${IdentityAuthMethod.LDAP_AUTH}:alice`]);

    await clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore);

    expect(keyStore.sortedSetMembersPrimary).toHaveBeenCalledWith(INDEX_KEY);
    expect(keyStore.sortedSetRangeByScore).not.toHaveBeenCalled();
  });

  test("never scans the keyspace", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetMembersPrimary.mockResolvedValue([`${IdentityAuthMethod.LDAP_AUTH}:alice`]);

    await clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore);

    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
    expect(keyStore.deleteItems).not.toHaveBeenCalled();
  });

  test("is a no-op when the identity has no lockout for that method", async () => {
    const keyStore = makeKeyStore();
    keyStore.sortedSetMembersPrimary.mockResolvedValue([`${IdentityAuthMethod.UNIVERSAL_AUTH}:client-a`]);

    await expect(clearIdentityLockoutsForAuthMethod(IDENTITY_ID, IdentityAuthMethod.LDAP_AUTH, keyStore)).resolves.toBe(
      0
    );
    expect(keyStore.deleteIndexedItems).not.toHaveBeenCalled();
  });
});
