import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { beforeEach, describe, expect, test } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import {
  clearIdentityLockoutsForAuthMethod,
  getIdentityActiveLockoutAuthMethods,
  getIdentityLockoutState,
  persistIdentityLockoutState
} from "@app/services/identity/identity-fns";

// These run against the real Redis the e2e environment boots, because the behaviour under test is
// server-side: the reap lives in a Lua script, and the regression this guards was a SCAN issued by
// ioredis. The in-memory keystore the unit tests use fakes both, so it cannot see either.
declare const testRedis: Redis;
declare const testKeyStore: TKeyStoreFactory;

const commandCalls = async (command: string) => {
  const info = await testRedis.info("commandstats");
  const line = info.split("\n").find((row) => row.startsWith(`cmdstat_${command}:`));
  // Anchored on the first field: a greedy match picks up the trailing failed_calls= instead and
  // reads every counter as zero, which makes an assertion built on this pass vacuously.
  return line ? Number(/^[^:]+:calls=(\d+),/.exec(line)?.[1] ?? 0) : 0;
};

const lockoutFor = (id: string) => KeyStorePrefixes.IdentityLockoutStateHash(id);

// Mirrors HASH_FIELD_REAP_THRESHOLD in the keystore: below this a hash is small enough that the
// reap skips it entirely, so a handful of expired fields legitimately survive until the key's TTL.
const REAP_THRESHOLD = 50;

// The reap keeps its resume position in a field of the same hash, so it is excluded here: only
// fields naming an auth method and slug are lockout state.
const lockoutFieldCount = async (id: string) =>
  Object.keys(await testRedis.hgetall(lockoutFor(id))).filter((field) => field.includes(":")).length;

let identityId: string;

beforeEach(async () => {
  identityId = randomUUID();
  await testRedis.del(lockoutFor(identityId));
});

describe("identity lockout keystore", () => {
  test("a lockout round-trips through the hash and is reported by auth method", async () => {
    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
      { lockedOut: true, failedAttempts: 3 },
      testKeyStore
    );

    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([
      IdentityAuthMethod.UNIVERSAL_AUTH
    ]);

    // The key must expire on its own; a lockout hash that outlives its lockout is a leak.
    const ttl = await testRedis.ttl(lockoutFor(identityId));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(300);
  });

  test("the key TTL only ever grows, so a short write cannot cut a long lockout short", async () => {
    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 3600 },
      { lockedOut: true, failedAttempts: 9 },
      testKeyStore
    );
    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice", expiryInSeconds: 30 },
      { lockedOut: false, failedAttempts: 1 },
      testKeyStore
    );

    expect(await testRedis.ttl(lockoutFor(identityId))).toBeGreaterThan(300);
  });

  test("a field past its own deadline is ignored even while the key is still alive", async () => {
    // Redis cannot expire one field, so a long-lived sibling keeps an expired one resident. Reads
    // have to honour expiresAt or a lockout outlives its duration.
    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 3600 },
      { lockedOut: false, failedAttempts: 1 },
      testKeyStore
    );
    await testRedis.hset(
      lockoutFor(identityId),
      KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, "alice"),
      JSON.stringify({ lockedOut: true, failedAttempts: 9, expiresAt: Date.now() - 1_000 })
    );

    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([]);
    await expect(
      getIdentityLockoutState({ identityId, authMethod: IdentityAuthMethod.LDAP_AUTH, slug: "alice" }, testKeyStore)
    ).resolves.toBeUndefined();
  });

  test("expired fields are reaped on write, so the resident set tracks the counter window", async () => {
    // Without the reap a field survives until the key TTL, which one 24h lockout can pin, rather
    // than until its own deadline.
    const expired = JSON.stringify({ lockedOut: true, failedAttempts: 1, expiresAt: Date.now() - 1_000 });
    const sprayed: Record<string, string> = {};
    for (let i = 0; i < 60; i += 1) {
      sprayed[KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, `sprayed-${i}`)] = expired;
    }
    await testRedis.hset(lockoutFor(identityId), sprayed);
    expect(await lockoutFieldCount(identityId)).toBe(60);

    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
      { lockedOut: false, failedAttempts: 1 },
      testKeyStore
    );

    expect(await lockoutFieldCount(identityId)).toBe(1);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([]);
  });

  test("the reap leaves live fields and fields carrying no deadline alone", async () => {
    const now = Date.now();
    const fields: Record<string, string> = {
      [KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, "live")]: JSON.stringify({
        lockedOut: true,
        failedAttempts: 9,
        expiresAt: now + 600_000
      }),
      [KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.TOKEN_AUTH, "no-deadline")]: JSON.stringify({
        lockedOut: true,
        failedAttempts: 9
      }),
      [KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.AWS_AUTH, "unreadable")]: "{{{"
    };
    for (let i = 0; i < 60; i += 1) {
      fields[KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, `dead-${i}`)] = JSON.stringify({
        lockedOut: true,
        failedAttempts: 1,
        expiresAt: now - 1_000
      });
    }
    await testRedis.hset(lockoutFor(identityId), fields);

    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
      { lockedOut: false, failedAttempts: 1 },
      testKeyStore
    );

    expect(await lockoutFieldCount(identityId)).toBe(4);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual(
      expect.arrayContaining([IdentityAuthMethod.LDAP_AUTH, IdentityAuthMethod.TOKEN_AUTH])
    );
  });

  test.each([
    // Below hash-max-listpack-entries (512 by default) HSCAN ignores cursor and COUNT and returns
    // the whole hash; above it, real cursor semantics apply. The reap has to make progress in both.
    { label: "listpack-encoded", fields: 400 },
    { label: "hashtable-encoded", fields: 1200 }
  ])("the reap eventually covers the whole $label hash instead of one fixed segment", async ({ fields }) => {
    const expired = JSON.stringify({ lockedOut: false, failedAttempts: 1, expiresAt: Date.now() - 1_000 });
    const sprayed: Record<string, string> = {};
    for (let i = 0; i < fields; i += 1) {
      sprayed[KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, `sprayed-${i}`)] = expired;
    }
    await testRedis.hset(lockoutFor(identityId), sprayed);

    const write = async () =>
      persistIdentityLockoutState(
        { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
        { lockedOut: false, failedAttempts: 1 },
        testKeyStore
      );

    // Counts lockout fields only: the reap keeps its resume position in a field of the same hash.
    const lockoutFields = async () => lockoutFieldCount(identityId);

    await write();
    const afterOne = await lockoutFields();

    // Bounded: one write must not have walked the whole hash, or the cost is caller-controlled.
    expect(afterOne).toBeGreaterThan(1);

    // ...and it must not stall. Scanning from a fixed start drains one segment and then returns the
    // same live fields forever, leaving everything else resident until the key's TTL.
    let remaining = afterOne;
    for (let i = 0; i < 200 && remaining > REAP_THRESHOLD; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await write();
      // eslint-disable-next-line no-await-in-loop
      remaining = await lockoutFields();
    }

    // Down to within the threshold below which the reap deliberately stops walking. What matters is
    // that the plateau is that constant and not whatever size the caller managed to grow the hash
    // to -- a fixed scan start plateaus at the latter.
    expect(remaining).toBeLessThanOrEqual(REAP_THRESHOLD);
  });

  test("no lockout path issues a SCAN, whatever the keyspace holds", async () => {
    // The incident: one SCAN MATCH walk of the whole keyspace per identity on every list row.
    // MATCH is a post-filter, so the cost tracked the keyspace, not the number of lockouts.
    const decoys: string[] = [];
    const pipeline = testRedis.pipeline();
    for (let i = 0; i < 2_000; i += 1) {
      const key = `lockout-scan-decoy:${identityId}:${i}`;
      decoys.push(key);
      pipeline.set(key, "1", "EX", 120);
    }
    await pipeline.exec();

    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
      { lockedOut: true, failedAttempts: 3 },
      testKeyStore
    );

    const scanBefore = await commandCalls("scan");
    const hgetallBefore = await commandCalls("hgetall");

    // Every read shape the list, detail and admin paths use.
    const LIST_READS = 10;
    for (let i = 0; i < LIST_READS; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await getIdentityActiveLockoutAuthMethods(identityId, testKeyStore);
    }
    await getIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a" },
      testKeyStore
    );
    await clearIdentityLockoutsForAuthMethod(identityId, IdentityAuthMethod.UNIVERSAL_AUTH, testKeyStore);

    // Proves the counter is actually being read before the SCAN assertion leans on it: a broken
    // parser reports zero for every command, which would make that assertion pass having measured
    // nothing. It also pins the cost itself -- one keyed read per list row, plus the clear path's.
    expect(await commandCalls("hgetall")).toBe(hgetallBefore + LIST_READS + 1);
    expect(await commandCalls("scan")).toBe(scanBefore);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual([]);

    await testRedis.del(...decoys);
  });
});
