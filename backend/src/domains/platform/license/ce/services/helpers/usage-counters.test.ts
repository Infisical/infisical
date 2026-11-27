import { Meter } from "../../models/meter";
import { buildLicense, productCounters, ROOT } from "../../testing/build-license";
import { FakeUsageCounter } from "../../testing/fake-usage-counter";
import { TProductUsageCounters } from "../dependencies";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const countMeterKeys = () =>
  Meter.all()
    .filter((meter) => meter.source === "count")
    .map((meter) => meter.key)
    .sort();

describe("LicenseModule.registerUsageCounters", () => {
  test("should report every count meter once the products register their counters", async () => {
    // Setup
    const { module } = await buildLicense({ skipRegistration: true });

    // Action
    module.registerUsageCounters(productCounters([]));

    // Assert
    expect(module.usageDimensions().sort()).toEqual(countMeterKeys());
  });

  test("should count a meter through the counter its product registered", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.PamIdentities).set(ROOT.id, 7);

    // Action
    const { usageMeteringService } = await buildLicense({ counters: [counter] });

    // Assert
    await expect(usageMeteringService.countUsage(ROOT.id, Meter.PamIdentities)).resolves.toBe(7);
  });

  test("should refuse a second registration", async () => {
    // Setup
    const { module } = await buildLicense();

    // Action
    const result = () => module.registerUsageCounters(productCounters([]));

    // Assert
    expect(result).toThrow("Usage counters were already registered");
  });

  test("should refuse a registration missing a product meter, naming it", async () => {
    // Setup
    const { module } = await buildLicense({ skipRegistration: true });
    const { pam_identities: _omitted, ...withoutPam } = productCounters([]);

    // Action
    const result = () => module.registerUsageCounters(withoutPam as TProductUsageCounters);

    // Assert
    expect(result).toThrow("No usage counter was registered for 'pam_identities'");
  });

  test("should refuse a counter for a meter recorded through metering events", async () => {
    // Setup
    const { module } = await buildLicense({ skipRegistration: true });
    const counters = { ...productCounters([]), agent_vault_brokered_requests: async () => 0 };

    // Action
    const result = () => module.registerUsageCounters(counters as TProductUsageCounters);

    // Assert
    expect(result).toThrow("Meter 'agent_vault_brokered_requests' is recorded through metering events");
  });

  test("should refuse a counter for a seat meter License counts itself", async () => {
    // Setup
    const { module } = await buildLicense({ skipRegistration: true });
    const counters = { ...productCounters([]), identities: async () => 0 };

    // Action
    const result = () => module.registerUsageCounters(counters as TProductUsageCounters);

    // Assert
    expect(result).toThrow("Two usage counters were given for 'identities'");
  });

  test("should refuse to start before the counters are registered", async () => {
    // Setup
    const { module } = await buildLicense({ skipRegistration: true });

    // Action
    const result = () => module.start();

    // Assert
    expect(result).toThrow("Usage counters were never registered. Call registerUsageCounters in createDomains.");
  });

  test("should name every product meter in the registration type", () => {
    // Setup
    const counter = async () => 0;

    // Action
    // @ts-expect-error a registration without wildcard_certs does not compile
    const missing: TProductUsageCounters = {
      secret_identities: counter,
      pam_identities: counter,
      internal_cas: counter,
      active_certs: counter
    };
    const extra: TProductUsageCounters = {
      ...productCounters([]),
      // @ts-expect-error an events meter takes no counter
      agent_vault_brokered_requests: counter
    };

    // Assert
    expect([missing, extra]).toHaveLength(2);
  });
});
