import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { beforeEach, describe, expect, test } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import {
  clearIdentityLockoutsForAuthMethod,
  clearIdentityLockoutState,
  getIdentityActiveLockoutAuthMethods,
  getIdentityLockoutState,
  persistIdentityLockoutState
} from "@app/services/identity/identity-fns";

// Against the real Redis the e2e environment boots, because what is under test is server-side: the
// write is a Lua script, expiry is Redis's own, and the regression this guards was a SCAN issued by
// ioredis. The in-memory keystore the unit tests use fakes all three.
declare const testRedis: Redis;
declare const testKeyStore: TKeyStoreFactory;

const commandCalls = async (command: string) => {
  const info = await testRedis.info("commandstats");
  const line = info.split("\n").find((row) => row.startsWith(`cmdstat_${command}:`));
  // Anchored on the first field: a greedy match picks up the trailing failed_calls= instead and
  // reads every counter as zero, which makes an assertion built on this pass vacuously.
  return line ? Number(/^[^:]+:calls=(\d+),/.exec(line)?.[1] ?? 0) : 0;
};

const indexKey = (id: string) => KeyStorePrefixes.IdentityLockoutIndex(id);
const itemKey = (id: string, authMethod: string, slug: string) =>
  KeyStorePrefixes.IdentityLockoutState(id, authMethod, slug);

const lockout = (identityId: string, slug: string, expiryInSeconds: number, lockedOut: boolean) =>
  persistIdentityLockoutState(
    { identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug, expiryInSeconds },
    { lockedOut, failedAttempts: lockedOut ? 3 : 1 },
    testKeyStore
  );

let identityId: string;

beforeEach(async () => {
  identityId = randomUUID();
  await testRedis.del(indexKey(identityId));
});

describe("identity lockout keystore", () => {
  test("a lockout round-trips, and both the item and the index expire on their own", async () => {
    await lockout(identityId, "alice", 300, true);

    await expect(
      getIdentityLockoutState({ identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" }, testKeyStore)
    ).resolves.toEqual({ lockedOut: true, failedAttempts: 3 });

    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);

    // Neither may outlive its lockout: a key with no TTL is a leak nothing reclaims.
    const itemTtl = await testRedis.ttl(itemKey(identityId, IdentityAuthMethod.LDAP_AUTH, "alice"));
    const idxTtl = await testRedis.ttl(indexKey(identityId));
    expect(itemTtl).toBeGreaterThan(0);
    expect(itemTtl).toBeLessThanOrEqual(300);
    expect(idxTtl).toBeGreaterThan(0);
  });

  test("the index expiry only ever grows, so a short write cannot cut a long lockout short", async () => {
    await lockout(identityId, "long", 3600, true);
    await lockout(identityId, "short", 30, true);

    expect(await testRedis.ttl(indexKey(identityId))).toBeGreaterThan(300);
  });

  test("a failure counter is never indexed, so spraying slugs cannot enlarge the list read", async () => {
    // LDAP slugs are caller-supplied usernames. Counters are addressed directly by login and are of
    // no use to the list endpoints, so keeping them out of the index is what bounds that read.
    for (let i = 0; i < 500; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await lockout(identityId, `sprayed-${i}`, 60, false);
    }

    expect(await testRedis.zcard(indexKey(identityId))).toBe(0);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([]);

    // The counters themselves are still readable by the login path that knows their slug.
    await expect(
      getIdentityLockoutState({ identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "sprayed-1" }, testKeyStore)
    ).resolves.toEqual({ lockedOut: false, failedAttempts: 1 });

    // ...and one real lockout among them is still found, without the spray inflating the index.
    await lockout(identityId, "victim", 300, true);
    expect(await testRedis.zcard(indexKey(identityId))).toBe(1);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });

  test("a member that outlives its item is not reported, before anything prunes it", async () => {
    // Redis expires the item on its own but cannot expire an index member, so the index is briefly
    // stale. Reads range by score, which is why that staleness is never visible.
    await lockout(identityId, "alice", 300, true);
    await testRedis.del(itemKey(identityId, IdentityAuthMethod.LDAP_AUTH, "alice"));
    await testRedis.zadd(indexKey(identityId), Date.now() - 1_000, `${IdentityAuthMethod.LDAP_AUTH}:alice`);

    expect(await testRedis.zcard(indexKey(identityId))).toBe(1);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([]);
  });

  test("expired members are pruned on write, in one command and with nothing left behind", async () => {
    const stale = Array.from({ length: 400 }, (_, i) => [
      Date.now() - 1_000,
      `${IdentityAuthMethod.LDAP_AUTH}:old-${i}`
    ]);
    await testRedis.zadd(indexKey(identityId), ...stale.flat());
    expect(await testRedis.zcard(indexKey(identityId))).toBe(400);

    // A single write, not a batch that has to be repeated: the index is ordered by deadline, so one
    // range removal takes every expired member regardless of how many there are.
    await lockout(identityId, "alice", 300, true);

    expect(await testRedis.zcard(indexKey(identityId))).toBe(1);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([
      IdentityAuthMethod.LDAP_AUTH
    ]);
  });

  test("clearing one slug removes the item and its index member together", async () => {
    await lockout(identityId, "alice", 300, true);
    await lockout(identityId, "bob", 300, true);

    await clearIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" },
      testKeyStore
    );

    expect(await testRedis.exists(itemKey(identityId, IdentityAuthMethod.LDAP_AUTH, "alice"))).toBe(0);
    expect(await testRedis.zscore(indexKey(identityId), `${IdentityAuthMethod.LDAP_AUTH}:alice`)).toBeNull();
    expect(await testRedis.zscore(indexKey(identityId), `${IdentityAuthMethod.LDAP_AUTH}:bob`)).not.toBeNull();
  });

  test("clearing a method removes every locked slug for it, and leaves other methods alone", async () => {
    await lockout(identityId, "alice", 300, true);
    await lockout(identityId, "bob", 300, true);
    await persistIdentityLockoutState(
      {
        identityId,
        authMethod: IdentityAuthMethod.UNIVERSAL_AUTH,
        slug: "client-a",
        expiryInSeconds: 300
      },
      { lockedOut: true, failedAttempts: 3 },
      testKeyStore
    );

    await expect(
      clearIdentityLockoutsForAuthMethod(identityId, IdentityAuthMethod.LDAP_AUTH, testKeyStore)
    ).resolves.toBe(2);

    expect(await testRedis.exists(itemKey(identityId, IdentityAuthMethod.LDAP_AUTH, "alice"))).toBe(0);
    expect(await testRedis.exists(itemKey(identityId, IdentityAuthMethod.LDAP_AUTH, "bob"))).toBe(0);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([
      IdentityAuthMethod.UNIVERSAL_AUTH
    ]);
  });

  test("no lockout path issues a SCAN, whatever the keyspace holds", async () => {
    // The incident: one SCAN MATCH walk of the whole keyspace per identity on every list row. MATCH
    // is a post-filter, so the cost tracked the keyspace, not the number of lockouts.
    const decoys: string[] = [];
    const pipeline = testRedis.pipeline();
    for (let i = 0; i < 2_000; i += 1) {
      const key = `lockout-scan-decoy:${identityId}:${i}`;
      decoys.push(key);
      pipeline.set(key, "1", "EX", 120);
    }
    await pipeline.exec();

    await lockout(identityId, "alice", 300, true);

    const scanBefore = await commandCalls("scan");
    const rangeBefore = await commandCalls("zrangebyscore");

    const LIST_READS = 10;
    for (let i = 0; i < LIST_READS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await getIdentityActiveLockoutAuthMethods(identityId, testKeyStore);
    }
    await getIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" },
      testKeyStore
    );
    await clearIdentityLockoutsForAuthMethod(identityId, IdentityAuthMethod.LDAP_AUTH, testKeyStore);

    // Proves the counter is being read at all before the SCAN assertion leans on it: a broken parser
    // reports zero for every command, which would make that assertion pass having measured nothing.
    // It also pins the cost -- one keyed range read per list row, and no more.
    expect(await commandCalls("zrangebyscore")).toBe(rangeBefore + LIST_READS);
    expect(await commandCalls("scan")).toBe(scanBefore);

    await testRedis.del(...decoys);
  });
});
