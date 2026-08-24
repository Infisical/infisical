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

const lockoutFor = (identityId: string) => KeyStorePrefixes.IdentityLockoutStateHash(identityId);

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
    expect(await testRedis.hlen(lockoutFor(identityId))).toBe(60);

    await persistIdentityLockoutState(
      { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
      { lockedOut: false, failedAttempts: 1 },
      testKeyStore
    );

    expect(await testRedis.hlen(lockoutFor(identityId))).toBe(1);
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

    expect(await testRedis.hlen(lockoutFor(identityId))).toBe(4);
    await expect(getIdentityActiveLockoutAuthMethods(identityId, testKeyStore)).resolves.toEqual(
      expect.arrayContaining([IdentityAuthMethod.LDAP_AUTH, IdentityAuthMethod.TOKEN_AUTH])
    );
  });

  test("the reap walks a bounded slice, so one write cannot be made to cost O(fields)", async () => {
    // LDAP slugs are caller-supplied usernames, so the field count is attacker-driven. Walking the
    // whole hash per write would make distributed attempts against one identity scale with the
    // square of the number of sources, on the single-threaded server this change exists to protect.
    const expired = JSON.stringify({ lockedOut: false, failedAttempts: 1, expiresAt: Date.now() - 1_000 });
    const sprayed: Record<string, string> = {};
    for (let i = 0; i < 400; i += 1) {
      sprayed[KeyStorePrefixes.IdentityLockoutStateField(IdentityAuthMethod.LDAP_AUTH, `sprayed-${i}`)] = expired;
    }
    await testRedis.hset(lockoutFor(identityId), sprayed);

    const write = async () =>
      persistIdentityLockoutState(
        { identityId, authMethod: IdentityAuthMethod.UNIVERSAL_AUTH, slug: "client-a", expiryInSeconds: 300 },
        { lockedOut: false, failedAttempts: 1 },
        testKeyStore
      );

    await write();
    const afterOne = await testRedis.hlen(lockoutFor(identityId));

    // Bounded: one write cannot have reclaimed all 400. If this ever reaches 1 the reap has gone
    // back to walking the whole hash and the cost is caller-controlled again.
    expect(afterOne).toBeGreaterThan(1);
    expect(afterOne).toBeLessThan(401);

    // ...but it reclaims far more per write than the single field a write adds, so it converges
    // rather than falling behind.
    let previous = afterOne;
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await write();
      // eslint-disable-next-line no-await-in-loop
      const current = await testRedis.hlen(lockoutFor(identityId));
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
    expect(previous).toBeLessThan(afterOne);
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
