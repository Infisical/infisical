import { InternalServerError } from "@app/lib/errors";

import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID, WORKSPACES_USED } from "../testing/build-license";
import { FakeLicenseHooks } from "../testing/fake-license-hooks";
import { FakeUsageCounter } from "../testing/fake-usage-counter";
import { enterprisePlan } from "../testing/test-features";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (hooks: FakeLicenseHooks, dimension: string) =>
  hooks.snapshots.filter((s) => s.snapshot.dimension_key === dimension).map((s) => [s.orgId, s.snapshot.value]);

const selfHostedHooks = () => {
  const hooks = new FakeLicenseHooks();
  hooks.instance = {
    ...hooks.instance,
    instanceType: InstanceType.EnterpriseOnPremOffline,
    features: enterprisePlan()
  };
  return hooks;
};

describe("PlanService.getPlan", () => {
  test("should return the instance's plan on self-hosted without touching the key store", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense({ hooks: selfHostedHooks() });

    // Action
    const plan = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(hooks.fetches).toEqual([]);
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).toBeNull();
  });

  test("should fetch for the root org and cache under the root's key on cloud", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense();

    // Action
    const plan = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(hooks.fetches).toEqual([ROOT.id]);
    expect(plan.workspacesUsed).toBe(WORKSPACES_USED);
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).not.toBeNull();
  });

  test("should serve a sub-org the root's cached plan without fetching again", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);

    // Action
    const plan = await licenseDomain.getPlan(SUB_ORG_ID);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(hooks.fetches).toHaveLength(1);
  });

  test("should not serve one root org's plan to another", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: "pro" });
    const { licenseDomain } = await buildLicense({ hooks });
    await licenseDomain.getPlan(ROOT.id);

    // Action
    const plan = await licenseDomain.getPlan(OTHER_ROOT.id);

    // Assert
    expect(plan.slug).toBe("pro");
  });

  test("should serve the community defaults with no slug and mark the fallback when the License Server fails", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.failNextFetches = 1;
    const { licenseDomain, keyStore } = await buildLicense({ hooks });

    // Action
    const plan = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBeNull();
    expect(await licenseDomain.isServingFallbackPlan(SUB_ORG_ID)).toBe(true);
    expect(await keyStore.getItem(`infisical-cloud-plan-fallback-${ROOT.id}`)).toBe("1");
  });

  test("should keep serving the cached fallback until it expires, then fetch again", async () => {
    // Setup
    let now = 1_000_000;
    const hooks = new FakeLicenseHooks();
    hooks.failNextFetches = 1;
    const { licenseDomain } = await buildLicense({ hooks, now: () => now });
    await licenseDomain.getPlan(ROOT.id);

    // Action
    const during = await licenseDomain.getPlan(ROOT.id);
    now += 2 * 60 * 60 * 1000;
    const after = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(during.slug).toBeNull();
    expect(after.slug).toBe("enterprise");
    expect(hooks.fetches).toHaveLength(2);
  });

  test("should clear the fallback and record the last known plan after a successful fetch", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.failNextFetches = 1;
    const { licenseDomain } = await buildLicense({ hooks });
    await licenseDomain.getPlan(ROOT.id);

    // Action
    await licenseDomain.refreshPlan(ROOT.id);

    // Assert
    expect(await licenseDomain.isServingFallbackPlan(ROOT.id)).toBe(false);
    expect((await licenseDomain.getLastKnownPlan(SUB_ORG_ID))?.plan.slug).toBe("enterprise");
  });

  test("should have no last known plan before the License Server ever answered", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.failNextFetches = 1;
    const { licenseDomain } = await buildLicense({ hooks });
    await licenseDomain.getPlan(ROOT.id);

    // Action
    const lastKnown = await licenseDomain.getLastKnownPlan(ROOT.id);

    // Assert
    expect(lastKnown).toBeNull();
  });

  test("should serve the fallback for an org that does not exist", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();

    // Action
    const plan = await licenseDomain.getPlan("44444444-4444-4444-8444-444444444444");

    // Assert
    expect(plan.slug).toBeNull();
    expect(hooks.fetches).toEqual([]);
  });

  test("should revalidate once in the background when the cache is marked stale, under concurrent reads", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);
    await keyStore.setItemWithExpiry(`license-cache-passthrough-${ROOT.id}`, 180, "1");

    // Action
    await Promise.all([
      licenseDomain.getPlan(ROOT.id),
      licenseDomain.getPlan(SUB_ORG_ID),
      licenseDomain.getPlan(ROOT.id)
    ]);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(hooks.fetches).toHaveLength(2);
  });

  test("should reconcile usage once per interval, and not for a plan with no slug", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: null });
    const { licenseDomain, queue } = await buildLicense({
      hooks,
      counters: [new FakeUsageCounter(Meter.UserIdentities)]
    });

    // Action
    await licenseDomain.getPlan(ROOT.id);
    await licenseDomain.getPlan(ROOT.id);
    await licenseDomain.getPlan(OTHER_ROOT.id);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    const orgsQueued = queue.jobs.map((j) => (j.data as { orgId: string }).orgId);
    expect(orgsQueued).toEqual([ROOT.id]);
  });
});

describe("PlanService.assertFeature", () => {
  test("should refuse a feature the org's plan lacks, naming it", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), externalKms: false });
    const { licenseDomain } = await buildLicense({ hooks });

    // Action
    const result = licenseDomain.assertFeature(SUB_ORG_ID, "externalKms");

    // Assert
    await expect(result).rejects.toThrow(
      "Your current plan does not include External KMS. Upgrade your plan to use it."
    );
  });
});

describe("PlanService.refreshPlan", () => {
  test("should fetch the plan again on cloud", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await licenseDomain.refreshPlan(SUB_ORG_ID);

    // Assert
    expect((await licenseDomain.getPlan(ROOT.id)).slug).toBe("pro");
  });

  test("should read an online self-hosted license again and serve its new plan to every org", async () => {
    // Setup
    const hooks = selfHostedHooks();
    hooks.online = true;
    const { licenseDomain } = await buildLicense({ hooks });
    hooks.instance = { ...hooks.instance, features: { ...enterprisePlan(), slug: "pro" } };

    // Action
    await licenseDomain.refreshPlan(ROOT.id);

    // Assert
    expect((await licenseDomain.getPlan(OTHER_ROOT.id)).slug).toBe("pro");
  });

  test("should leave an offline license's plan as it is", async () => {
    // Setup
    const hooks = selfHostedHooks();
    const { licenseDomain } = await buildLicense({ hooks });
    hooks.instance = { ...hooks.instance, features: { ...enterprisePlan(), slug: "pro" } };

    // Action
    await licenseDomain.refreshPlan(ROOT.id);

    // Assert
    expect((await licenseDomain.getPlan(ROOT.id)).slug).toBe("enterprise");
  });
});

describe("PlanService.refreshPlan after a billing change", () => {
  test("should keep serving the cached plan and refresh it in the background once", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await licenseDomain.refreshPlan(SUB_ORG_ID, { afterBillingChange: { checkout: true } });
    const served = await licenseDomain.getPlan(ROOT.id);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(served.slug).toBe("enterprise");
    expect((await licenseDomain.getPlan(ROOT.id)).slug).toBe("pro");
    expect(hooks.fetches).toHaveLength(2);
  });

  test("should do nothing on self-hosted", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense({ hooks: selfHostedHooks() });

    // Action
    await licenseDomain.refreshPlan(ROOT.id, { afterBillingChange: {} });

    // Assert
    expect(hooks.fetches).toEqual([]);
  });
});

describe("PlanService.syncSeats", () => {
  test("should report the root's member count and refresh its plan", async () => {
    // Setup
    const members = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 6);
    const { licenseDomain, queue, hooks } = await buildLicense({ counters: [members] });
    await licenseDomain.getPlan(ROOT.id);
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await licenseDomain.syncSeats(SUB_ORG_ID);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toEqual([[ROOT.id, 6]]);
    expect((await licenseDomain.getPlan(ROOT.id)).slug).toBe("pro");
  });

  test("should not throw when the refresh fails on an online self-hosted license", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    hooks.online = true;
    hooks.refreshFailure = new Error("License Server unreachable");
    const { licenseDomain } = await buildLicense({ hooks });

    // Action
    const result = licenseDomain.syncSeats(ROOT.id);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});

describe("PlanService.cancelSubscription", () => {
  test("should cancel on cloud and drop the cached plan", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);

    // Action
    await licenseDomain.cancelSubscription(ROOT.id);

    // Assert
    expect(hooks.cancellations).toEqual([ROOT.id]);
    await licenseDomain.getPlan(ROOT.id);
    expect(hooks.fetches).toHaveLength(2);
  });

  test("should do nothing on self-hosted", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem };
    const { licenseDomain } = await buildLicense({ hooks });

    // Action
    await licenseDomain.cancelSubscription(ROOT.id);

    // Assert
    expect(hooks.cancellations).toEqual([]);
  });

  test("should treat a 4xx as nothing to cancel", async () => {
    // Setup
    const { BadRequestError } = await import("@app/lib/errors");
    const hooks = new FakeLicenseHooks();
    hooks.cancelFailure = new BadRequestError({ message: "no subscription" });
    const { licenseDomain } = await buildLicense({ hooks });

    // Action
    const result = licenseDomain.cancelSubscription(ROOT.id);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test("should throw any other failure and keep the cached plan", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    const { licenseDomain } = await buildLicense({ hooks });
    await licenseDomain.getPlan(ROOT.id);
    hooks.cancelFailure = new InternalServerError({ message: "License Server failed" });

    // Action
    const result = licenseDomain.cancelSubscription(ROOT.id);

    // Assert
    await expect(result).rejects.toThrow("License Server failed");
    await licenseDomain.getPlan(ROOT.id);
    expect(hooks.fetches).toHaveLength(1);
  });
});
