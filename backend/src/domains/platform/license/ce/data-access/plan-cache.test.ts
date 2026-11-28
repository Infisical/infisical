import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";

import { Plan } from "../models/plan";
import { testFeatures } from "../testing/test-features";
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

describe("PlanCache read and write", () => {
  const plan = Plan.restore({ ...testFeatures(), slug: "pro" });
  const build = () => {
    const clock = { now: 1_000_000 };
    const keyStore = new InMemoryKeyStore(() => clock.now);
    return { clock, keyStore, cache: new PlanCache(keyStore, () => clock.now) };
  };

  test("should serve a written plan as fresh, then stale before it expires, then not at all", async () => {
    // Setup
    const { clock, cache } = build();
    await cache.write(ROOT_ID, plan);

    // Action
    clock.now += 18 * 60_000;
    const fresh = await cache.read(ROOT_ID);
    clock.now += 4 * 60_000;
    const stale = await cache.read(ROOT_ID);
    clock.now += 9 * 60_000;
    const expired = await cache.read(ROOT_ID);

    // Assert
    expect([fresh.plan?.slug, fresh.stale]).toEqual(["pro", false]);
    expect([stale.plan?.slug, stale.stale]).toEqual(["pro", true]);
    expect(expired.plan).toBeNull();
  });

  test("should read a plan an old pod wrote, with no refresh time, as stale", async () => {
    // Setup
    const { keyStore, cache } = build();
    await keyStore.setItemWithExpiry(`infisical-cloud-plan-${ROOT_ID}`, 900, JSON.stringify(plan.toJSON()));

    // Action
    const { plan: read, stale } = await cache.read(ROOT_ID);

    // Assert
    expect([read?.slug, stale]).toEqual(["pro", true]);
  });
});
