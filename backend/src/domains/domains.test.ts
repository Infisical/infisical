import { ProjectType } from "@app/db/schemas";

import { createDomains } from "./domains";
import { Meter } from "./platform/license/ce/module";

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
      eventEmitter: { emit: vi.fn() },
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

  test("should have PAM, Agent Vault and KMS register their project roles, and PAM and Agent Vault override custom roles", () => {
    // Setup
    const deps = {
      db: {},
      keyStore: {},
      queueService: { queue: vi.fn(), start: vi.fn() },
      cronJob: { register: vi.fn() },
      eventEmitter: { emit: vi.fn() },
      envConfig: { isCloud: false, isProductionMode: false }
    } as unknown as Parameters<typeof createDomains>[0];

    // Action
    const registered = createDomains(deps).projects.productAccessRegistry.registeredProjectTypes();

    // Assert
    expect(registered.defaultRoles.sort()).toEqual([ProjectType.AgentVault, ProjectType.KMS, ProjectType.PAM].sort());
    expect(registered.customRoles.sort()).toEqual([ProjectType.AgentVault, ProjectType.PAM].sort());
  });
});
