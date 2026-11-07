import { createDomains } from "./domains";
import { METERED_FEATURES } from "./platform/license/ce/module";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("createDomains", () => {
  test("should give the License domain exactly one counter for every metered dimension", () => {
    // Setup
    const deps = {
      db: {},
      keyStore: {},
      queueService: { queue: vi.fn(), start: vi.fn() },
      cronJob: { register: vi.fn() },
      envConfig: { isCloud: false, isProductionMode: false },
      resolveRootOrg: vi.fn(),
      countBillableProjects: vi.fn()
    } as unknown as Parameters<typeof createDomains>[0];

    // Action
    const domains = createDomains(deps);

    // Assert
    const counted = [
      domains.organizationsProjects,
      domains.secrets,
      domains.pam,
      domains.agentVault,
      domains.certManager
    ].flatMap((module) => module.usageCounters.map((counter) => counter.feature.key));
    expect(counted.sort()).toEqual(METERED_FEATURES.map((feature) => feature.key).sort());
  });
});
