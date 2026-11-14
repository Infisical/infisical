import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { FreeUsageCache } from "./free-usage-cache";

describe("FreeUsageCache", () => {
  test("should claim a report id once", async () => {
    // Setup
    const cache = new FreeUsageCache(new InMemoryKeyStore());

    // Action
    const first = await cache.claimReport("report-1");
    const resend = await cache.claimReport("report-1");

    // Assert
    expect(first).toBe(true);
    expect(resend).toBe(false);
  });

  test("should count per root org and month", async () => {
    // Setup
    const cache = new FreeUsageCache(new InMemoryKeyStore());
    const november = new Date("2026-11-14T10:00:00Z");

    // Action
    await cache.add("org-a", november, 100);
    await cache.add("org-a", new Date("2026-11-30T23:00:00Z"), 20);
    await cache.add("org-b", november, 7);

    // Assert
    expect(await cache.read("org-a", november)).toBe(120);
    expect(await cache.read("org-b", november)).toBe(7);
    expect(await cache.read("org-a", new Date("2026-12-01T00:00:00Z"))).toBe(0);
  });
});
