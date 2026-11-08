import { createDomains } from "./domains";
import { METERED_FEATURES } from "./platform/license/ce/module";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("createDomains", () => {
  test("should register exactly one usage counter for every metered dimension with License", () => {
    // Setup
    const deps = {
      db: {},
      keyStore: {},
      queueService: { queue: vi.fn(), start: vi.fn() },
      cronJob: { register: vi.fn() },
      envConfig: { isCloud: false, isProductionMode: false }
    } as unknown as Parameters<typeof createDomains>[0];

    // Action
    const domains = createDomains(deps);

    // Assert
    expect(domains.license.usageDimensions().sort()).toEqual(METERED_FEATURES.map((feature) => feature.key).sort());
  });
});
