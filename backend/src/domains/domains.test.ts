import { createDomains } from "./domains";
import { Meter } from "./platform/license/ce/module";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("createDomains", () => {
  test("should give License exactly one usage counter for every metered dimension", () => {
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
    expect(domains.license.usageDimensions().sort()).toEqual(
      Meter.all()
        .map((meter) => meter.key)
        .sort()
    );
  });
});
