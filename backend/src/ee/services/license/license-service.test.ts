import { describe, expect, test, vi } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";

import { licenseServiceFactory } from "./license-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}));

vi.mock("./license-fns", () => ({
  getDefaultOnPremFeatures: () => ({ slug: null, secretRotation: false, rateLimits: {} }),
  getLicenseKeyConfig: () => ({ isValid: false })
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

describe("cloud plan refresh", () => {
  test.each([
    { outage: true, hasCache: true },
    { outage: false, hasCache: true },
    { outage: true, hasCache: false },
    { outage: false, hasCache: false }
  ])("preserves the cache and reconciles usage (outage: $outage, cached: $hasCache)", async ({ outage, hasCache }) => {
    const cachedPlan = { slug: "pro", secretRotation: true, productPlans: [] };
    const cache = new Map<string, string>(
      hasCache ? [[KeyStorePrefixes.LicenseCloudPlan(ORG_ID), JSON.stringify(cachedPlan)]] : []
    );
    const keyStore = {
      getItems: vi.fn(async (keys: string[]) => keys.map((key) => cache.get(key) ?? null)),
      setItemWithExpiry: vi.fn(async (key: string, _ttl: number, value: string) => {
        cache.set(key, value);
        return "OK";
      }),
      setItemWithExpiryNX: vi.fn().mockResolvedValue("OK"),
      deleteItem: vi.fn(async (key: string) => {
        cache.delete(key);
      })
    };
    const getEntitlements = vi.fn(async () => {
      const storedPlan = cache.get(KeyStorePrefixes.LicenseCloudPlan(ORG_ID));
      if (hasCache) {
        expect(JSON.parse(storedPlan!)).toEqual(cachedPlan);
      } else {
        expect(storedPlan).toBeUndefined();
      }
      if (outage) throw new Error("License Server unavailable");
      return {
        slug: "advanced",
        features: { secret_rotation: { value: true } },
        products: [{ product_key: "secrets_manager", plan_key: "advanced", status: "active" }]
      };
    });
    const reconcile = vi.fn(async () => {
      cache.set(KeyStorePrefixes.LicenseUsageReconcileMarker(ORG_ID), "1");
    });
    const service = licenseServiceFactory({
      envConfig: { LICENSE_SERVER_V2_SERVICE_KEY: "test-key", isCloud: true },
      orgDAL: { findRootOrgDetails: vi.fn().mockResolvedValue({ id: ORG_ID, name: "Test", slug: "test" }) },
      permissionService: { getOrgPermission: vi.fn() },
      licenseDAL: { countBillableOrgActors: vi.fn() },
      keyStore,
      projectDAL: { countOfBillableOrgProjects: vi.fn().mockResolvedValue(1) },
      licenseClient: { getEntitlements },
      usageMeteringService: { reconcile, emit: vi.fn() }
    } as unknown as Parameters<typeof licenseServiceFactory>[0]);
    await service.init();
    const plan = await service.getOrgPlan({
      orgId: ORG_ID,
      rootOrgId: ORG_ID,
      actorOrgId: ORG_ID,
      actorId: "user-1",
      actor: "user",
      actorAuthMethod: "email",
      refreshCache: true
    } as Parameters<typeof service.getOrgPlan>[0]);

    const isFreeFallback = outage && !hasCache;
    const expectedPaidSlug = outage ? "pro" : "advanced";
    expect(plan.slug).toBe(isFreeFallback ? null : expectedPaidSlug);
    expect(plan.secretRotation).toBe(!isFreeFallback);
    expect(getEntitlements).toHaveBeenCalledTimes(1);
    expect(reconcile).toHaveBeenCalledTimes(isFreeFallback ? 0 : 1);
    const persistedPlan = JSON.parse(cache.get(KeyStorePrefixes.LicenseCloudPlan(ORG_ID))!) as { slug: string | null };
    expect(persistedPlan.slug).toBe(plan.slug);
    expect(keyStore.deleteItem).not.toHaveBeenCalledWith(KeyStorePrefixes.LicenseCloudPlan(ORG_ID));
    if (outage && hasCache) {
      expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
    } else if (!outage) {
      expect(plan.productPlans).toEqual([
        { productKey: "secrets_manager", planKey: "advanced", status: "active", trialPlanKey: null, trialEndsAt: null }
      ]);
    }
  });
});
