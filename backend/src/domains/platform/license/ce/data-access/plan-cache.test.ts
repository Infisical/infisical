import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { PlanCache } from "./plan-cache";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";
const LOCK_KEY = `license-cache-revalidate-lock-${ROOT_ID}`;

describe("PlanCache revalidate lock", () => {
  test("should hand the lock to one caller at a time", async () => {
    // Setup
    const cache = new PlanCache(new InMemoryKeyStore());

    // Action
    const [first, second] = await Promise.all([
      cache.acquireRevalidateLock(ROOT_ID),
      cache.acquireRevalidateLock(ROOT_ID)
    ]);

    // Assert
    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  test("should not release a lock taken after the holder's own expired", async () => {
    // Setup
    let now = 1_000_000;
    const keyStore = new InMemoryKeyStore(() => now);
    const cache = new PlanCache(keyStore);
    const slowHolder = await cache.acquireRevalidateLock(ROOT_ID);
    now += 11_000;
    const nextHolder = await cache.acquireRevalidateLock(ROOT_ID);

    // Action
    await cache.releaseRevalidateLock(ROOT_ID, slowHolder as string);

    // Assert
    expect(nextHolder).not.toBeNull();
    expect(await keyStore.getItem(LOCK_KEY)).toBe(nextHolder);
    expect(await cache.acquireRevalidateLock(ROOT_ID)).toBeNull();
  });

  test("should release the holder's own lock", async () => {
    // Setup
    const cache = new PlanCache(new InMemoryKeyStore());
    const token = await cache.acquireRevalidateLock(ROOT_ID);

    // Action
    await cache.releaseRevalidateLock(ROOT_ID, token as string);

    // Assert
    expect(await cache.acquireRevalidateLock(ROOT_ID)).not.toBeNull();
  });
});
