import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { PlanCache } from "./plan-cache";

const ROOT_ID = "11111111-1111-4111-8111-111111111111";

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
});
