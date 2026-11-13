import { ExternalSystemError } from "@app/domains/lib/errors";

import { InstanceType } from "../../models/instance-entitlements";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID, WORKSPACES_USED } from "../../testing/build-license";
import { FakeLicenseServer } from "../../testing/fake-license-server";
import { enterprisePlan, testFeatures } from "../../testing/test-features";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const selfHostedLicenseServer = () => {
  const licenseServer = new FakeLicenseServer();
  licenseServer.instance = {
    ...licenseServer.instance,
    instanceType: InstanceType.EnterpriseOnPremOffline,
    features: enterprisePlan()
  };
  return licenseServer;
};

describe("LicenseService.getPlan", () => {
  const queuedDimensions = async (queue: { jobs: { data: unknown }[] }) => {
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    return queue.jobs.map((job) => (job.data as { dimensionKey: string }).dimensionKey).sort();
  };

  test("should resend every meter of a paid org on its first plan read, then not again", async () => {
    // Setup
    const { licenseService, module, queue } = await buildLicense();
    await licenseService.getPlan(ROOT.id);
    const firstRead = await queuedDimensions(queue);
    queue.jobs = [];

    // Action
    await licenseService.getPlan(ROOT.id);

    // Assert
    expect(firstRead).toEqual(module.usageDimensions().sort());
    expect(await queuedDimensions(queue)).toEqual([]);
  });

  test("should not resend the meters of a free org", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(ROOT.id, testFeatures());
    const { licenseService, queue } = await buildLicense({ licenseServer });

    // Action
    await licenseService.getPlan(ROOT.id);

    // Assert
    expect(await queuedDimensions(queue)).toEqual([]);
  });

  test("should name the root org to the License Server when fetching a sub-org's plan", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();

    // Action
    await licenseService.getPlan(SUB_ORG_ID);

    // Assert
    expect(licenseServer.fetchedOrgs).toEqual([{ id: ROOT.id, name: `org ${ROOT.id}`, slug: `org-${ROOT.id}` }]);
  });

  test("should return the instance's plan on self-hosted without touching the key store", async () => {
    // Setup
    const { licenseService, keyStore, licenseServer } = await buildLicense({
      licenseServer: selfHostedLicenseServer()
    });

    // Action
    const plan = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(licenseServer.fetches).toEqual([]);
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).toBeNull();
  });

  test("should fetch for the root org and cache under the root's key on cloud", async () => {
    // Setup
    const { licenseService, keyStore, licenseServer } = await buildLicense();

    // Action
    const plan = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(licenseServer.fetches).toEqual([ROOT.id]);
    expect(plan.toJSON().workspacesUsed).toBe(WORKSPACES_USED);
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).not.toBeNull();
  });

  test("should serve a sub-org the root's cached plan without fetching again", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);

    // Action
    const plan = await licenseService.getPlan(SUB_ORG_ID);

    // Assert
    expect(plan.slug).toBe("enterprise");
    expect(licenseServer.fetches).toHaveLength(1);
  });

  test("should not serve one root org's plan to another", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: "pro" });
    const { licenseService } = await buildLicense({ licenseServer });
    await licenseService.getPlan(ROOT.id);

    // Action
    const plan = await licenseService.getPlan(OTHER_ROOT.id);

    // Assert
    expect(plan.slug).toBe("pro");
  });

  test("should serve the community defaults with no slug and mark the fallback when the License Server fails", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextFetches = 1;
    const { licenseService, keyStore } = await buildLicense({ licenseServer });

    // Action
    const plan = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBeNull();
    expect(await licenseService.isServingFallbackPlan(SUB_ORG_ID)).toBe(true);
    expect(await keyStore.getItem(`infisical-cloud-plan-fallback-${ROOT.id}`)).toBe("1");
  });

  test("should keep serving the cached fallback until it expires, then fetch again", async () => {
    // Setup
    let now = 1_000_000;
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextFetches = 1;
    const { licenseService } = await buildLicense({ licenseServer, now: () => now });
    await licenseService.getPlan(ROOT.id);

    // Action
    const during = await licenseService.getPlan(ROOT.id);
    now += 2 * 60 * 60 * 1000;
    const after = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(during.slug).toBeNull();
    expect(after.slug).toBe("enterprise");
    expect(licenseServer.fetches).toHaveLength(2);
  });

  test("should clear the fallback and record the last known plan after a successful fetch", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextFetches = 1;
    const { licenseService } = await buildLicense({ licenseServer });
    await licenseService.getPlan(ROOT.id);

    // Action
    await licenseService.refreshPlan(ROOT.id);

    // Assert
    expect(await licenseService.isServingFallbackPlan(ROOT.id)).toBe(false);
    expect((await licenseService.getLastKnownPlan(SUB_ORG_ID))?.plan.slug).toBe("enterprise");
  });

  test("should have no last known plan before the License Server ever answered", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextFetches = 1;
    const { licenseService } = await buildLicense({ licenseServer });
    await licenseService.getPlan(ROOT.id);

    // Action
    const lastKnown = await licenseService.getLastKnownPlan(ROOT.id);

    // Assert
    expect(lastKnown).toBeNull();
  });

  test("should serve a root org's cached plan when the org lookup fails", async () => {
    // Setup
    const { licenseService, keyStore } = await buildLicense({
      organizations: {
        findRootOrgId: async () => {
          throw new Error("replica timeout");
        }
      }
    });
    const cachedPlan = JSON.stringify({ ...enterprisePlan(), slug: "pro" });
    await keyStore.setItemWithExpiry(`infisical-cloud-plan-${ROOT.id}`, 900, cachedPlan);

    // Action
    const plan = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBe("pro");
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).toBe(cachedPlan);
  });

  test("should serve the fallback uncached and keep the cached plan when a sub-org's lookup fails", async () => {
    // Setup
    const { licenseService, keyStore } = await buildLicense({
      organizations: {
        findRootOrgId: async () => {
          throw new Error("replica timeout");
        }
      }
    });
    const cachedPlan = JSON.stringify({ ...enterprisePlan(), slug: "pro" });
    await keyStore.setItemWithExpiry(`infisical-cloud-plan-${ROOT.id}`, 900, cachedPlan);

    // Action
    const plan = await licenseService.getPlan(SUB_ORG_ID);

    // Assert
    expect(plan.slug).toBeNull();
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).toBe(cachedPlan);
    expect(await keyStore.getItem(`infisical-cloud-plan-fallback-${ROOT.id}`)).toBeNull();
  });

  test("should serve the fallback uncached when reading the org's name fails on a cache miss", async () => {
    // Setup
    const { licenseService, licenseServer, keyStore } = await buildLicense({
      organizations: {
        findOrganization: async () => {
          throw new Error("replica timeout");
        }
      }
    });

    // Action
    const plan = await licenseService.getPlan(ROOT.id);

    // Assert
    expect(plan.slug).toBeNull();
    expect(licenseServer.fetchedOrgs).toEqual([]);
    expect(await keyStore.getItem(`infisical-cloud-plan-${ROOT.id}`)).toBeNull();
    expect(await keyStore.getItem(`infisical-cloud-plan-fallback-${ROOT.id}`)).toBeNull();
  });

  test("should serve the fallback for an org that does not exist", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();

    // Action
    const plan = await licenseService.getPlan("44444444-4444-4444-8444-444444444444");

    // Assert
    expect(plan.slug).toBeNull();
    expect(licenseServer.fetches).toEqual([]);
  });

  test("should revalidate once in the background when the cache is marked stale, under concurrent reads", async () => {
    // Setup
    const { licenseService, keyStore, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);
    await keyStore.setItemWithExpiry(`license-cache-passthrough-${ROOT.id}`, 180, "1");

    // Action
    await Promise.all([
      licenseService.getPlan(ROOT.id),
      licenseService.getPlan(SUB_ORG_ID),
      licenseService.getPlan(ROOT.id)
    ]);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(licenseServer.fetches).toHaveLength(2);
  });
});

describe("LicenseService.refreshPlan", () => {
  test("should fetch the plan again on cloud", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);
    licenseServer.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await licenseService.refreshPlan(SUB_ORG_ID);

    // Assert
    expect((await licenseService.getPlan(ROOT.id)).slug).toBe("pro");
  });

  test("should keep the cached plan and refuse when the License Server fails during a refresh", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);
    licenseServer.failNextFetches = 1;

    // Action
    const result = licenseService.refreshPlan(SUB_ORG_ID);

    // Assert
    await expect(result).rejects.toThrow("Your current plan stays in place");
    expect((await licenseService.getPlan(ROOT.id)).slug).toBe("enterprise");
    expect(await licenseService.isServingFallbackPlan(ROOT.id)).toBe(false);
  });

  test("should pass a database error through a refresh rather than blame the License Server", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense({
      organizations: {
        findOrganization: async () => {
          throw new Error("replica timeout");
        }
      }
    });

    // Action
    const result = licenseService.refreshPlan(ROOT.id);

    // Assert
    await expect(result).rejects.toThrow("replica timeout");
    expect(licenseServer.fetchedOrgs).toEqual([]);
  });

  test("should read an online self-hosted license again and serve its new plan to every org", async () => {
    // Setup
    const licenseServer = selfHostedLicenseServer();
    licenseServer.online = true;
    const { licenseService } = await buildLicense({ licenseServer });
    licenseServer.instance = { ...licenseServer.instance, features: { ...enterprisePlan(), slug: "pro" } };

    // Action
    await licenseService.refreshPlan(ROOT.id);

    // Assert
    expect((await licenseService.getPlan(OTHER_ROOT.id)).slug).toBe("pro");
  });

  test("should leave an offline license's plan as it is", async () => {
    // Setup
    const licenseServer = selfHostedLicenseServer();
    const { licenseService } = await buildLicense({ licenseServer });
    licenseServer.instance = { ...licenseServer.instance, features: { ...enterprisePlan(), slug: "pro" } };

    // Action
    await licenseService.refreshPlan(ROOT.id);

    // Assert
    expect((await licenseService.getPlan(ROOT.id)).slug).toBe("enterprise");
  });
});

describe("LicenseService.refreshPlan after a billing change", () => {
  test("should keep serving the cached plan and refresh it in the background once", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);
    licenseServer.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await licenseService.refreshPlan(SUB_ORG_ID, { afterBillingChange: { checkout: true } });
    const served = await licenseService.getPlan(ROOT.id);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(served.slug).toBe("enterprise");
    expect((await licenseService.getPlan(ROOT.id)).slug).toBe("pro");
    expect(licenseServer.fetches).toHaveLength(2);
  });

  test("should not fail the billing change when the root org lookup fails", async () => {
    // Setup
    const { licenseService } = await buildLicense({
      organizations: {
        findRootOrgId: async () => {
          throw new Error("replica unavailable");
        }
      }
    });

    // Action
    const refresh = licenseService.refreshPlan(SUB_ORG_ID, { afterBillingChange: {} });

    // Assert
    await expect(refresh).resolves.toBeUndefined();
  });

  test("should do nothing on self-hosted", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense({ licenseServer: selfHostedLicenseServer() });

    // Action
    await licenseService.refreshPlan(ROOT.id, { afterBillingChange: {} });

    // Assert
    expect(licenseServer.fetches).toEqual([]);
  });
});

describe("LicenseService.closeDeletedOrg", () => {
  test("should close the org on the License Server and drop the cached plan", async () => {
    // Setup
    const { licenseService, licenseServer } = await buildLicense();
    await licenseService.getPlan(ROOT.id);

    // Action
    const result = await licenseService.closeDeletedOrg(ROOT.id);

    // Assert
    expect(licenseServer.deletedOrgs).toEqual([ROOT.id]);
    expect(result.licensesClosed).toBe(1);
    await licenseService.getPlan(ROOT.id);
    expect(licenseServer.fetches).toHaveLength(2);
  });

  test("should throw a failure and keep the cached plan", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    const { licenseService } = await buildLicense({ licenseServer });
    await licenseService.getPlan(ROOT.id);
    licenseServer.deleteFailure = new ExternalSystemError({ message: "License Server failed" });

    // Action
    const result = licenseService.closeDeletedOrg(ROOT.id);

    // Assert
    await expect(result).rejects.toThrow("License Server failed");
    await licenseService.getPlan(ROOT.id);
    expect(licenseServer.fetches).toHaveLength(1);
  });
});

describe("LicenseService.refreshInstanceEntitlements", () => {
  test("should serve the online license's new plan after a refresh", async () => {
    // Setup
    const licenseServer = selfHostedLicenseServer();
    licenseServer.online = true;
    const { licenseService } = await buildLicense({ licenseServer });
    licenseServer.instance = { ...licenseServer.instance, features: { ...enterprisePlan(), slug: "pro" } };

    // Action
    await licenseService.refreshInstanceEntitlements();

    // Assert
    expect(licenseService.getInstanceEntitlements().plan().slug).toBe("pro");
  });

  test("should throw and keep the current license when the License Server fails", async () => {
    // Setup
    const licenseServer = selfHostedLicenseServer();
    licenseServer.online = true;
    const { licenseService } = await buildLicense({ licenseServer });
    licenseServer.instance = { ...licenseServer.instance, features: { ...enterprisePlan(), slug: "pro" } };
    licenseServer.refreshFailure = new Error("License Server unreachable");

    // Action
    const result = licenseService.refreshInstanceEntitlements();

    // Assert
    await expect(result).rejects.toThrow("License Server unreachable");
    expect(licenseService.getInstanceEntitlements().plan().slug).toBe("enterprise");
  });
});
