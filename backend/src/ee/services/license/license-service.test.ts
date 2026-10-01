import { describe, expect, test, vi } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";

import { licenseServiceFactory } from "./license-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn() }
}));

vi.mock("./license-fns", () => ({
  getDefaultOnPremFeatures: () => ({ slug: null, rateLimits: {} }),
  getLicenseKeyConfig: () => ({ isValid: false })
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";

describe("cloud plan refresh", () => {
  test.each([true, false])("preserves the paid cache until refresh succeeds (outage: %s)", async (outage) => {
    const cachedPlan = { slug: "pro", secretRotation: true, productPlans: [] };
    const cache = new Map<string, string>([[KeyStorePrefixes.LicenseCloudPlan(ORG_ID), JSON.stringify(cachedPlan)]]);
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
      expect(JSON.parse(cache.get(KeyStorePrefixes.LicenseCloudPlan(ORG_ID))!)).toEqual(cachedPlan);
      if (outage) throw new Error("License Server unavailable");
      return {
        slug: "advanced",
        features: { secret_rotation: { value: true } },
        products: [{ product_key: "secrets_manager", plan_key: "advanced", status: "active" }]
      };
    });
    const service = licenseServiceFactory({
      envConfig: { LICENSE_SERVER_V2_SERVICE_KEY: "test-key", isCloud: true },
      orgDAL: { findRootOrgDetails: vi.fn().mockResolvedValue({ id: ORG_ID, name: "Test", slug: "test" }) },
      permissionService: { getOrgPermission: vi.fn() },
      licenseDAL: { countBillableOrgActors: vi.fn() },
      keyStore,
      projectDAL: { countOfBillableOrgProjects: vi.fn().mockResolvedValue(1) },
      licenseClient: { getEntitlements }
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

    expect(plan.slug).toBe(outage ? "pro" : "advanced");
    expect(plan.secretRotation).toBe(true);
    const persistedPlan = JSON.parse(cache.get(KeyStorePrefixes.LicenseCloudPlan(ORG_ID))!) as { slug: string };
    expect(persistedPlan.slug).toBe(plan.slug);
    expect(keyStore.deleteItem).not.toHaveBeenCalledWith(KeyStorePrefixes.LicenseCloudPlan(ORG_ID));
    if (outage) {
      expect(keyStore.setItemWithExpiry).not.toHaveBeenCalled();
    } else {
      expect(plan.productPlans).toEqual([
        { productKey: "secrets_manager", planKey: "advanced", status: "active", trialPlanKey: null, trialEndsAt: null }
      ]);
    }
  });
});
