import { InstanceType } from "../../../ce/models/instance-entitlements";
import { PlanFeature } from "../../../ce/models/plan";
import { TEntitlementOrg, TEntitlementsResponse } from "../../../ce/services/helpers/license-server-types";
import { TLicenseServerEntitlements } from "../dependencies";
import { getLicenseKeyConfig } from "./license-key";
import { LicensePolicyService } from "./service";

vi.mock("@app/lib/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/logger")>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

const verified = vi.hoisted(() => ({ value: true }));
vi.mock("@app/lib/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/crypto")>()),
  verifyOfflineLicense: async () => verified.value
}));

const offlineKey = (license: Record<string, unknown>) =>
  Buffer.from(
    JSON.stringify({ license: { terminatesAt: null, licenseId: "lic-1", ...license }, signature: "c2ln" })
  ).toString("base64");

const entitlements = (features: TEntitlementsResponse["features"]) =>
  ({ slug: "enterprise", features, products: [] }) as unknown as TEntitlementsResponse;

type TResolveOptions = {
  licenseKey?: string;
  licenseKeyOffline?: string;
  isCloud?: boolean;
  onlineEntitlements?: TEntitlementsResponse;
  onlineFails?: boolean;
};

const resolve = async ({
  licenseKey = "",
  licenseKeyOffline,
  isCloud = false,
  onlineEntitlements,
  onlineFails = false
}: TResolveOptions) => {
  // The client answers null when the License Server can't be read.
  const licenseServerClient: TLicenseServerEntitlements = {
    getEntitlements: async () => (onlineFails ? null : (onlineEntitlements ?? null))
  };
  const policy = new LicensePolicyService(
    isCloud,
    getLicenseKeyConfig({ LICENSE_KEY: licenseKey, LICENSE_KEY_OFFLINE: licenseKeyOffline }),
    licenseServerClient
  );
  return { policy, instance: await policy.resolveInstanceEntitlements() };
};

beforeEach(() => {
  verified.value = true;
});

describe("LicensePolicyService.resolveInstanceEntitlements", () => {
  test("should resolve Cloud when the service key is set, even with a license key", async () => {
    // Setup + Action
    const { instance } = await resolve({ isCloud: true, licenseKey: "online-license-key" });

    // Assert
    expect(instance.instanceType).toBe(InstanceType.Cloud);
  });

  test("should resolve an online key to EnterpriseOnPrem with the License Server's entitlements", async () => {
    // Setup + Action
    const { instance } = await resolve({
      licenseKey: "online-license-key",
      onlineEntitlements: entitlements({ rbac: { value: true } } as never)
    });

    // Assert
    expect(instance.instanceType).toBe(InstanceType.EnterpriseOnPrem);
    expect(instance.toJSON().features.rbac).toBe(true);
  });

  test("should fall back to the community edition when the online license cannot be read", async () => {
    // Setup + Action
    const { instance } = await resolve({ licenseKey: "online-license-key", onlineFails: true });

    // Assert
    expect(instance.instanceType).toBe(InstanceType.OnPrem);
    expect(instance.toJSON().features.slug).toBeNull();
  });

  test("should resolve a valid offline key to EnterpriseOnPremOffline with its license id", async () => {
    // Setup + Action
    const { instance } = await resolve({ licenseKey: offlineKey({ version: 1, features: { rbac: true } }) });

    // Assert
    expect(instance.instanceType).toBe(InstanceType.EnterpriseOnPremOffline);
    expect(instance.toJSON().features).toMatchObject({ slug: "enterprise", isOffline: true, rbac: true });
    expect(instance.licenseId).toBe("lic-1");
  });

  test("should fall back to the community edition when the offline key's signature does not verify", async () => {
    // Setup
    verified.value = false;

    // Action
    const { instance } = await resolve({ licenseKey: offlineKey({ version: 1, features: { rbac: true } }) });

    // Assert
    expect(instance.instanceType).toBe(InstanceType.OnPrem);
    expect(instance.toJSON().features.rbac).toBe(false);
  });

  test("should fall back to the community edition when the offline key has terminated, not merely expired", async () => {
    // Setup
    const past = new Date(Date.now() - 86_400_000).toISOString();

    // Action
    const terminated = await resolve({ licenseKey: offlineKey({ version: 1, features: {}, terminatesAt: past }) });
    const expired = await resolve({ licenseKey: offlineKey({ version: 1, features: {}, expiresAt: past }) });

    // Assert
    expect(terminated.instance.instanceType).toBe(InstanceType.OnPrem);
    expect(expired.instance.instanceType).toBe(InstanceType.EnterpriseOnPremOffline);
  });

  test("should read LICENSE_KEY_OFFLINE only when LICENSE_KEY is empty and the value is an offline key", async () => {
    // Setup
    const key = offlineKey({ version: 1, features: {} });

    // Action
    const legacy = await resolve({ licenseKeyOffline: key });
    const notOffline = await resolve({ licenseKeyOffline: "not-an-offline-key" });

    // Assert
    expect(legacy.instance.instanceType).toBe(InstanceType.EnterpriseOnPremOffline);
    expect(notOffline.instance.instanceType).toBe(InstanceType.OnPrem);
  });

  test("should grant PAM alerting to a key issued with the old Slack notifications flag", async () => {
    // Setup + Action
    const { instance } = await resolve({
      licenseKey: offlineKey({ version: 1, features: { pamSlackNotifications: true } })
    });

    // Assert
    expect(instance.toJSON().features.pamEnterpriseAlerting).toBe(true);
  });

  test("should leave CAs uncapped for a license that does not set max_cas, and keep the cap when it does", async () => {
    // Setup + Action
    const uncapped = await resolve({
      licenseKey: offlineKey({ version: 2, features: {}, entitlements: entitlements({}) })
    });
    const capped = await resolve({
      licenseKey: offlineKey({
        version: 2,
        features: {},
        entitlements: entitlements({ max_cas: { value: 4 } } as never)
      })
    });
    const v1 = await resolve({ licenseKey: offlineKey({ version: 1, features: { maxCas: 3 } }) });
    const online = await resolve({ licenseKey: "online-license-key", onlineEntitlements: entitlements({}) });
    const unlicensed = await resolve({});

    // Assert
    expect([uncapped, capped, v1, online, unlicensed].map((r) => r.instance.toJSON().features.maxCas)).toEqual([
      null,
      4,
      3,
      null,
      1
    ]);
  });

  test("should give default session log storage only when a license's entitlements turn it on", async () => {
    // Setup + Action
    const off = await resolve({
      licenseKey: "online-license-key",
      onlineEntitlements: entitlements({ agent_vault_managed_storage: { value: false, source: "default" } } as never)
    });
    const on = await resolve({
      licenseKey: "online-license-key",
      onlineEntitlements: entitlements({ agent_vault_managed_storage: { value: true, source: "plan" } } as never)
    });
    const unlicensed = await resolve({});

    // Assert
    expect([off, on, unlicensed].map((r) => r.instance.toJSON().features.agentVaultManagedStorage)).toEqual([
      false,
      true,
      false
    ]);
  });
});

describe("LicensePolicyService.refreshInstanceEntitlements", () => {
  test("should read an online license again, and do nothing for an offline one", async () => {
    // Setup
    const online = await resolve({ licenseKey: "online-license-key", onlineEntitlements: entitlements({}) });
    const offline = await resolve({ licenseKey: offlineKey({ version: 1, features: {} }) });

    // Action
    const refreshed = await Promise.all([
      online.policy.refreshInstanceEntitlements(),
      offline.policy.refreshInstanceEntitlements()
    ]);

    // Assert
    expect(refreshed[0]?.instanceType).toBe(InstanceType.EnterpriseOnPrem);
    expect(refreshed[1]).toBeNull();
  });
});

const ROOT_ORG: TEntitlementOrg = { id: "root-org", name: "Acme", slug: "acme" };

// Answers every read with the given entitlements, or null as when the License Server can't be read.
const cloudPolicy = (answer: TEntitlementsResponse | null) => {
  const asked: TEntitlementOrg[] = [];
  const policy = new LicensePolicyService(
    true,
    { isValid: false },
    {
      getEntitlements: async (org) => {
        asked.push(org);
        return answer;
      }
    }
  );
  return { policy, asked };
};

describe("LicensePolicyService.fetchPlan", () => {
  test("should ask for the root org and turn its entitlements into its plan", async () => {
    // Setup
    const { policy, asked } = cloudPolicy({ ...entitlements({ rbac: { value: true } } as never), slug: "pro" });

    // Action
    const plan = await policy.fetchPlan(ROOT_ORG);

    // Assert
    expect(asked).toEqual([ROOT_ORG]);
    expect(plan.slug).toBe("pro");
    expect(plan.has(PlanFeature.Rbac)).toBe(true);
  });

  test("should throw when the License Server cannot be read, so the domain serves the fallback", async () => {
    // Setup
    const { policy } = cloudPolicy(null);

    // Action
    const result = policy.fetchPlan(ROOT_ORG);

    // Assert
    await expect(result).rejects.toThrow("License Server entitlements are unavailable");
  });
});

describe("LicensePolicyService.fallbackPlan", () => {
  test("should be the free tier with cloud defaults, and no slug", () => {
    // Setup
    const { policy } = cloudPolicy(null);

    // Action
    const plan = policy.fallbackPlan();

    // Assert
    expect(plan.slug).toBeNull();
    expect(plan.has(PlanFeature.Rbac)).toBe(false);
    expect(plan.toJSON().agentVaultManagedStorage).toBe(true);
  });
});
