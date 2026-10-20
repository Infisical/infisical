import { TEntitlementsResponse } from "@app/services/license-client/license-client-types";

import { licenseServiceFactory } from "./license-service";

vi.mock("@app/lib/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/logger")>()),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/lib/crypto", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/crypto")>()),
  verifyOfflineLicense: async () => true
}));

const offlineKey = (license: Record<string, unknown>) =>
  Buffer.from(JSON.stringify({ license: { terminatesAt: null, ...license }, signature: "c2ln" })).toString("base64");

const entitlements = (features: TEntitlementsResponse["features"]) =>
  ({ slug: "enterprise", features, products: [] }) as unknown as TEntitlementsResponse;

const loadPlan = async ({
  licenseKey,
  onlineEntitlements
}: {
  licenseKey: string;
  onlineEntitlements?: TEntitlementsResponse;
}) => {
  const service = licenseServiceFactory({
    envConfig: {
      LICENSE_KEY: licenseKey,
      LICENSE_KEY_OFFLINE: undefined,
      LICENSE_SERVER_V2_SERVICE_KEY: undefined,
      isCloud: false
    },
    orgDAL: {} as never,
    permissionService: {} as never,
    licenseDAL: {} as never,
    keyStore: {} as never,
    projectDAL: {} as never,
    licenseClient: onlineEntitlements ? ({ getEntitlements: async () => onlineEntitlements } as never) : undefined
  });
  await service.init();
  return service.onPremFeatures;
};

describe("self-hosted license CA cap", () => {
  test("a v1 offline key without maxCas leaves CAs uncapped instead of the free tier's single CA", async () => {
    const plan = await loadPlan({ licenseKey: offlineKey({ version: 1, features: { maxInternalCas: 10 } }) });
    expect(plan.isOffline).toBe(true);
    expect(plan.maxCas).toBeNull();
    expect(plan.maxInternalCas).toBe(10);
  });

  test("a v1 offline key that sets maxCas keeps it", async () => {
    const plan = await loadPlan({ licenseKey: offlineKey({ version: 1, features: { maxCas: 3 } }) });
    expect(plan.maxCas).toBe(3);
  });

  test("a v2 offline key without max_cas leaves CAs uncapped; with it, the cap applies", async () => {
    const uncapped = await loadPlan({
      licenseKey: offlineKey({ version: 2, features: {}, entitlements: entitlements({}) })
    });
    expect(uncapped.isOffline).toBe(true);
    expect(uncapped.maxCas).toBeNull();

    const capped = await loadPlan({
      licenseKey: offlineKey({ version: 2, features: {}, entitlements: entitlements({ max_cas: { value: 4 } }) })
    });
    expect(capped.maxCas).toBe(4);
  });

  test("an online self-hosted license whose entitlements omit max_cas leaves CAs uncapped", async () => {
    const plan = await loadPlan({ licenseKey: "online-license-key", onlineEntitlements: entitlements({}) });
    expect(plan.maxCas).toBeNull();
  });

  test("an unlicensed instance keeps the free tier's single CA", async () => {
    const plan = await loadPlan({ licenseKey: "" });
    expect(plan.maxCas).toBe(1);
  });
});
