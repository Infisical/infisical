import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../testing/build-license";
import { FakeLicenseHooks } from "../testing/fake-license-hooks";
import { FakeUsageCounter } from "../testing/fake-usage-counter";
import { enterprisePlan } from "../testing/test-features";
import { UsageReportError } from "./license-server-types/usage-reports";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (hooks: FakeLicenseHooks, dimension: string) =>
  hooks.snapshots.filter((s) => s.snapshot.dimension_key === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("UsageService.handleUsageEvent", () => {
  test("should report the counter's value and record it", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseDomain, queue, hooks } = await buildLicense({ counters: [counter] });

    // Action
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toEqual([[ROOT.id, 4]]);
  });

  test("should not report a value the server already has", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseDomain, queue, hooks } = await buildLicense({ counters: [counter] });
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Action
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toHaveLength(1);
  });

  test("should report nothing for an org on cloud whose plan has no slug", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: null });
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseDomain, queue } = await buildLicense({ hooks, counters: [counter] });

    // Action
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(hooks.snapshots).toEqual([]);
  });

  test("should report an org-tree meter at the root, and an org meter at the org that changed", async () => {
    // Setup
    const certs = new FakeUsageCounter(Meter.ActiveCerts).set(ROOT.id, 9);
    const users = new FakeUsageCounter(Meter.UserIdentities).set(SUB_ORG_ID, 2);
    const { licenseDomain, queue, hooks } = await buildLicense({ counters: [certs, users] });

    // Action
    licenseDomain.emit(SUB_ORG_ID, Meter.ActiveCerts.key);
    licenseDomain.emit(SUB_ORG_ID, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, Meter.ActiveCerts.key)).toEqual([[ROOT.id, 9]]);
    expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toEqual([[SUB_ORG_ID, 2]]);
  });

  test("should report under the instance on self-hosted, counting the whole instance", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(null, 12);
    const { licenseDomain, queue } = await buildLicense({ hooks, counters: [counter] });

    // Action
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toEqual([["self-hosted", 12]]);
    expect(hooks.snapshots[0].snapshot.source).toBe("self-hosted");
  });

  test("should drop an event for a dimension nothing counts", async () => {
    // Setup
    const { licenseDomain, queue, hooks } = await buildLicense();

    // Action
    licenseDomain.emit(ROOT.id, "unknown_dimension");
    await queue.drain();

    // Assert
    expect(hooks.snapshots).toEqual([]);
  });

  test.each([
    [404, "license not found"],
    [422, "dimension is not priced by any active product on this license"]
  ])(
    "should drop a %i the server gives as its final answer, and send the value again next time",
    async (status, message) => {
      // Setup
      const hooks = new FakeLicenseHooks();
      hooks.failNextReports.push(new UsageReportError(status, message));
      const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
      const { licenseDomain, queue } = await buildLicense({ hooks, counters: [counter] });
      licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
      await queue.drain();

      // Action
      licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);
      await queue.drain();

      // Assert
      expect(snapshotsFor(hooks, Meter.UserIdentities.key)).toEqual([[ROOT.id, 4]]);
    }
  );

  test("should fail the job on any other error, so the queue retries it", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.failNextReports.push(new UsageReportError(500, "boom"));
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseDomain, queue } = await buildLicense({ hooks, counters: [counter] });
    licenseDomain.emit(ROOT.id, Meter.UserIdentities.key);

    // Action
    const result = queue.drain();

    // Assert
    await expect(result).rejects.toThrow("usage report failed with 500");
  });

  test("should re-emit each meter once at the instance for the daily flush, and only for online self-hosted", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    const { registeredCrons } = await buildLicense({ hooks });
    const cloud = await buildLicense();

    // Action
    const enabled = [registeredCrons, cloud.registeredCrons];

    // Assert
    expect(enabled).toEqual([["license-usage-flush:true"], ["license-usage-flush:false"]]);
  });
});

describe("UsageService.getSeatUsage", () => {
  test("should count the root org's tree on cloud", async () => {
    // Setup
    const members = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 3);
    const identities = new FakeUsageCounter(Meter.Identities).set(ROOT.id, 7);
    const { licenseDomain } = await buildLicense({ counters: [members, identities] });

    // Action
    const usage = await licenseDomain.getSeatUsage(SUB_ORG_ID);

    // Assert
    expect(usage).toEqual({ membersUsed: 3, identitiesUsed: 7 });
  });

  test("should count every org on the instance for the instance's seat usage, even on cloud", async () => {
    // Setup
    const identities = new FakeUsageCounter(Meter.Identities).set(ROOT.id, 2).set(null, 9);
    const { licenseDomain } = await buildLicense({ counters: [identities] });

    // Action
    const usage = await licenseDomain.getInstanceSeatUsage();

    // Assert
    expect(usage.identitiesUsed).toBe(9);
  });

  test("should refuse an org that does not exist on cloud", async () => {
    // Setup
    const { licenseDomain } = await buildLicense();

    // Action
    const result = licenseDomain.getSeatUsage(OTHER_ROOT.id.replace("3", "5"));

    // Assert
    await expect(result).rejects.toThrow("not found");
  });
});

describe("LicenseModule", () => {
  test("should refuse two counters for one dimension", async () => {
    // Setup
    const counters = [new FakeUsageCounter(Meter.UserIdentities), new FakeUsageCounter(Meter.UserIdentities)];

    // Action
    const result = buildLicense({ counters });

    // Assert
    await expect(result).rejects.toThrow("Two usage counters were registered for 'user_identities'");
  });

  test("should refuse a second organizations registration", async () => {
    // Setup
    const { module } = await buildLicense();

    // Action
    const register = () =>
      module.registry.registerOrganizations({ findRootOrg: async () => null, countWorkspacesUsed: async () => 0 });

    // Assert
    expect(register).toThrow("The organizations directory was registered twice");
  });
});
