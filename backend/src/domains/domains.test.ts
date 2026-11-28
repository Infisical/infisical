import { crypto } from "@app/lib/crypto/cryptography";

import { createDomains } from "./domains";
import { Meter } from "./platform/license/ce/module";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

// KMS Core reads the root key from the database on build, and this test has no database.
vi.mock("./platform/kms-core/ee/module", () => ({
  KmsCoreEeModule: { create: vi.fn(async () => ({ hooks: {} })) }
}));
vi.mock("./platform/kms-core/ee/external-kms-module", () => ({
  ExternalKmsEeModule: class {
    readonly externalKmsService = {};
  }
}));
const createKmsCore = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("./platform/kms-core/ce/module", () => ({
  KmsCoreModule: { create: createKmsCore }
}));

// Instance Config Core creates its row in the database when it is built, which this test has none of.
vi.mock("./platform/instance-config-core/ce/module", () => ({
  InstanceConfigCoreModule: { create: vi.fn(async () => ({})) }
}));

const buildDeps = () =>
  ({
    db: {},
    keyStore: {},
    queueService: { queue: vi.fn(), start: vi.fn() },
    cronJob: { register: vi.fn() },
    envConfig: { isCloud: false, isProductionMode: false }
  }) as unknown as Parameters<typeof createDomains>[0];

describe("createDomains", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createKmsCore.mockClear();
  });

  test("should give License exactly one usage counter for every metered dimension", async () => {
    // Setup
    vi.spyOn(crypto, "verifyFipsLicense").mockImplementation(() => undefined);
    const deps = buildDeps();

    // Action
    const domains = await createDomains(deps);

    // Assert
    expect(domains.license.usageDimensions().sort()).toEqual(
      Meter.all()
        .filter((meter) => meter.source === "count")
        .map((meter) => meter.key)
        .sort()
    );
  });

  test("should refuse an unlicensed FIPS instance before KMS Core writes a root key", async () => {
    // Setup
    vi.spyOn(crypto, "verifyFipsLicense").mockImplementation(() => {
      throw new Error("FIPS mode is enabled but your license does not include FIPS support.");
    });

    // Action
    const result = createDomains(buildDeps());

    // Assert
    await expect(result).rejects.toThrow("FIPS mode is enabled");
    expect(createKmsCore).not.toHaveBeenCalled();
  });
});
