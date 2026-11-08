import { InstanceType } from "../model/license-types";
import { UserIdentities } from "../model/metered-features";
import { LicenseKeys } from "../model/plan-cache-keys";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID, WORKSPACES_USED } from "../testing/build-license";
import { enterprisePlan, FakeLicenseHooks } from "../testing/fake-license-hooks";
import { FakeUsageCounter } from "../testing/fake-usage-counter";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const selfHostedHooks = () => {
  const hooks = new FakeLicenseHooks();
  hooks.instance = {
    ...hooks.instance,
    instanceType: InstanceType.EnterpriseOnPremOffline,
    features: enterprisePlan()
  };
  return hooks;
};

describe("EntitlementService.getPlan", () => {
  test("should return the instance's plan on self-hosted without touching the key store", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense({ hooks: selfHostedHooks() });

    // Action
    const plan = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(hooks.planFetches).toEqual([]);
    expect(await keyStore.getItem(LicenseKeys.cloudPlan(ROOT.id))).toBeNull();
  });

  test("should fetch for the root org and cache under the root's key on cloud", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense();

    // Action
    const plan = await licenseDomain.getPlan(ROOT.id);

    // Assert
    expect(hooks.planFetches).toEqual([ROOT]);
    expect(plan.workspacesUsed).toBe(WORKSPACES_USED);
    expect(await keyStore.getItem(LicenseKeys.cloudPlan(ROOT.id))).not.toBeNull();
  });

  test("should serve a sub-org the root's cached plan without fetching again", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);

    // Action
    const plan = await licenseDomain.getPlan(SUB_ORG_ID);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(hooks.planFetches).toHaveLength(1);
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
    expect(await keyStore.getItem(LicenseKeys.cloudPlanFallback(ROOT.id))).toBe("1");
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
    expect(hooks.planFetches).toHaveLength(2);
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
    expect(hooks.planFetches).toEqual([]);
  });

  test("should revalidate once in the background when the cache is marked stale, under concurrent reads", async () => {
    // Setup
    const { licenseDomain, keyStore, hooks } = await buildLicense();
    await licenseDomain.getPlan(ROOT.id);
    await keyStore.setItemWithExpiry(LicenseKeys.passThrough(ROOT.id), 180, "1");

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
    expect(hooks.planFetches).toHaveLength(2);
  });

  test("should reconcile usage once per interval, and not for a plan with no slug", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: null });
    const { licenseDomain, queue } = await buildLicense({ hooks, counters: [new FakeUsageCounter(UserIdentities)] });

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

describe("EntitlementService.assertFeature", () => {
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

describe("EntitlementService.refreshPlan", () => {
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

describe("LicenseModule without EE hooks", () => {
  test("should serve the community defaults and refuse every paid feature", async () => {
    // Setup
    const { InMemoryKeyStore } = await import("@app/domains/lib/testing/in-memory-key-store");
    const { LicenseModule } = await import("../module");
    const module = new LicenseModule({
      keyStore: new InMemoryKeyStore(),
      queueService: { queue: vi.fn(), start: vi.fn() } as never,
      cronJob: { register: vi.fn() },
      isProductionMode: false,
      startLocalRefresh: vi.fn()
    });
    module.registry.registerOrganizations({ findRootOrg: async () => ROOT, countWorkspacesUsed: async () => 0 });
    await module.start();

    // Action
    const result = module.service.assertFeature(ROOT.id, "rbac");

    // Assert
    await expect(result).rejects.toThrow("does not include Role-based Access Control");
    expect(module.service.getInstanceType()).toBe(InstanceType.OnPrem);
    expect((await module.service.getPlan(ROOT.id)).slug).toBeNull();
  });
});

describe("EntitlementService.refreshPlan after a billing change", () => {
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
    expect(hooks.planFetches).toHaveLength(2);
  });

  test("should do nothing on self-hosted", async () => {
    // Setup
    const { licenseDomain, hooks } = await buildLicense({ hooks: selfHostedHooks() });

    // Action
    await licenseDomain.refreshPlan(ROOT.id, { afterBillingChange: {} });

    // Assert
    expect(hooks.planFetches).toEqual([]);
  });
});
