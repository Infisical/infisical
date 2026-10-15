import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { beforeEach, describe, expect, test } from "vitest";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";

// This runs against the real Redis the e2e environment starts, because the daily cap is a Lua script, and what it
// promises (the cap holds under concurrent uploads, a refusal adds nothing, the expiry is fixed at the first write)
// only Redis can show.
declare const testRedis: Redis;
declare const testKeyStore: TKeyStoreFactory;

const LIMIT = 100;
const TTL_SECONDS = 2 * 24 * 60 * 60;

let key: string;

const admit = (value: number) => testKeyStore.incrementByIfUnderLimitWithFixedExpiry(key, value, LIMIT, TTL_SECONDS);

beforeEach(async () => {
  key = KeyStorePrefixes.ObjectStorageDailyBytes(randomUUID(), "2026-10-14");
  await testRedis.del(key);
});

describe("object storage daily byte counter", () => {
  test("adds up to the cap and refuses what would pass it", async () => {
    expect(await admit(60)).toBe(60);
    expect(await admit(40)).toBe(100);
    expect(await admit(1)).toBe(-1);
  });

  test("a refusal adds nothing, so a smaller upload still fits", async () => {
    expect(await admit(90)).toBe(90);
    expect(await admit(20)).toBe(-1);
    expect(await testRedis.get(key)).toBe("90");
    expect(await admit(10)).toBe(100);
  });

  test("concurrent uploads at the cap never take it past the limit", async () => {
    const results = await Promise.all(Array.from({ length: 30 }, () => admit(7)));
    const admitted = results.filter((total) => total !== -1);

    expect(admitted).toHaveLength(Math.floor(LIMIT / 7));
    expect(Number(await testRedis.get(key))).toBe(admitted.length * 7);
  });

  test("the expiry is set by the first write and later writes don't extend it", async () => {
    await admit(10);
    expect(await testRedis.ttl(key)).toBeGreaterThan(TTL_SECONDS - 5);

    await testRedis.expire(key, 60);
    await admit(10);
    expect(await testRedis.ttl(key)).toBeLessThanOrEqual(60);
  });

  test("a refused first write leaves no key behind", async () => {
    expect(await admit(LIMIT + 1)).toBe(-1);
    expect(await testRedis.exists(key)).toBe(0);
  });
});
