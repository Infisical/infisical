import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../testing/build-license";
import { FakeLicenseServer } from "../testing/fake-license-server";
import { FakeUsageCounter } from "../testing/fake-usage-counter";
import { enterprisePlan } from "../testing/test-features";
import { UsageReportError } from "./license-server-types/usage-reports";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (licenseServer: FakeLicenseServer, dimension: string) =>
  licenseServer.snapshots.filter((s) => s.snapshot.dimension_key === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("LicenseService.handleUsageEvent", () => {
  test("should report the counter's value and record it", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseService, queue, licenseServer } = await buildLicense({ counters: [counter] });

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toEqual([[ROOT.id, 4]]);
  });

  test("should send a recount under a new idempotency key when a retry follows a lost reply", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.ActiveCerts).set(ROOT.id, 9);
    const { licenseService, queue, licenseServer } = await buildLicense({ counters: [counter] });
    licenseServer.loseNextReplies = 1;
    licenseService.emit(ROOT.id, Meter.ActiveCerts.key);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    const [job] = queue.jobs;
    const run = () => queue.handlers.get(job.queue)!({ data: job.data });
    vi.useFakeTimers({ toFake: ["Date"], now: 1_700_000_005_000 });
    await expect(run()).rejects.toThrow("License Server reply lost");
    counter.set(ROOT.id, 8);
    vi.setSystemTime(1_700_000_015_000);

    // Action
    await run().finally(() => vi.useRealTimers());

    // Assert
    const sent = licenseServer.snapshots.map((s) => s.snapshot);
    expect(sent.map((s) => s.value)).toEqual([9, 8]);
    expect(new Set(sent.map((s) => s.idempotency_key)).size).toBe(2);
  });

  test("should not report a value the server already has", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseService, queue, licenseServer } = await buildLicense({ counters: [counter] });
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toHaveLength(1);
  });

  test("should report nothing for an org on cloud whose plan has no slug", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(ROOT.id, { ...enterprisePlan(), slug: null });
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseService, queue } = await buildLicense({ licenseServer, counters: [counter] });

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots).toEqual([]);
  });

  test("should report an org-tree meter at the root, and an org meter at the org that changed", async () => {
    // Setup
    const certs = new FakeUsageCounter(Meter.ActiveCerts).set(ROOT.id, 9);
    const users = new FakeUsageCounter(Meter.UserIdentities).set(SUB_ORG_ID, 2);
    const { licenseService, queue, licenseServer } = await buildLicense({ counters: [certs, users] });

    // Action
    licenseService.emit(SUB_ORG_ID, Meter.ActiveCerts.key);
    licenseService.emit(SUB_ORG_ID, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.ActiveCerts.key)).toEqual([[ROOT.id, 9]]);
    expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toEqual([[SUB_ORG_ID, 2]]);
  });

  test("should report under the instance on self-hosted, counting the whole instance", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = {
      ...licenseServer.instance,
      instanceType: InstanceType.EnterpriseOnPrem,
      features: enterprisePlan()
    };
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(null, 12);
    const { licenseService, queue } = await buildLicense({ licenseServer, counters: [counter] });

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toEqual([["self-hosted", 12]]);
    expect(licenseServer.snapshots[0].snapshot.source).toBe("self-hosted");
  });

  test("should drop an event for a dimension nothing counts", async () => {
    // Setup
    const { licenseService, queue, licenseServer } = await buildLicense();

    // Action
    licenseService.emit(ROOT.id, "unknown_dimension");
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots).toEqual([]);
  });

  test.each([
    [404, "license not found"],
    [422, "dimension is not priced by any active product on this license"]
  ])(
    "should drop a %i the server gives as its final answer, and send the value again next time",
    async (status, message) => {
      // Setup
      const licenseServer = new FakeLicenseServer();
      licenseServer.failNextReports.push(new UsageReportError(status, message));
      const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
      const { licenseService, queue } = await buildLicense({ licenseServer, counters: [counter] });
      licenseService.emit(ROOT.id, Meter.UserIdentities.key);
      await queue.drain();

      // Action
      licenseService.emit(ROOT.id, Meter.UserIdentities.key);
      await queue.drain();

      // Assert
      expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toEqual([[ROOT.id, 4]]);
    }
  );

  test("should fail the job on any other error, so the queue retries it", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextReports.push(new UsageReportError(500, "boom"));
    const counter = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 4);
    const { licenseService, queue } = await buildLicense({ licenseServer, counters: [counter] });
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);

    // Action
    const result = queue.drain();

    // Assert
    await expect(result).rejects.toThrow("usage report failed with 500");
  });

  test("should enable the daily flush on online self-hosted, and not on cloud or an offline license", async () => {
    // Setup
    const online = new FakeLicenseServer();
    online.instance = { ...online.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    const offline = new FakeLicenseServer();
    offline.instance = { ...online.instance, instanceType: InstanceType.EnterpriseOnPremOffline };
    offline.offline = true;

    // Action
    const enabled = await Promise.all(
      [online, offline, new FakeLicenseServer()].map(
        async (licenseServer) => (await buildLicense({ licenseServer })).registeredCrons
      )
    );

    // Assert
    expect(enabled).toEqual([
      ["license-usage-flush:true"],
      ["license-usage-flush:false"],
      ["license-usage-flush:false"]
    ]);
  });
});

describe("LicenseService.flushInstanceUsage", () => {
  test("should report every meter once under the instance, counting the whole instance", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = {
      ...licenseServer.instance,
      instanceType: InstanceType.EnterpriseOnPrem,
      features: enterprisePlan()
    };
    const counters = [
      new FakeUsageCounter(Meter.UserIdentities).set(null, 12),
      new FakeUsageCounter(Meter.ActiveCerts).set(null, 4)
    ];
    const { cronHandlers, queue } = await buildLicense({ licenseServer, counters });

    // Action
    await cronHandlers.get("license-usage-flush")!();
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots.map((s) => [s.orgId, s.snapshot.dimension_key, s.snapshot.value])).toEqual([
      ["self-hosted", Meter.UserIdentities.key, 12],
      ["self-hosted", Meter.ActiveCerts.key, 4]
    ]);
  });
});

describe("LicenseService.getSeatUsage", () => {
  test("should count the root org's tree on cloud, in one count", async () => {
    // Setup
    const counted: (string | null)[] = [];
    const { licenseService } = await buildLicense({
      organizations: {
        countBillableOrgActors: async (orgId) => {
          counted.push(orgId);
          return { users: 3, identities: 4 };
        }
      }
    });

    // Action
    const usage = await licenseService.getSeatUsage(SUB_ORG_ID);

    // Assert
    expect([usage.membersUsed, usage.identitiesUsed]).toEqual([3, 7]);
    expect(counted).toEqual([ROOT.id]);
  });

  test("should count every org on the instance for the instance's seat usage, even on cloud", async () => {
    // Setup
    const { licenseService } = await buildLicense({
      organizations: {
        countBillableOrgActors: async (orgId) => ({ users: 0, identities: orgId === null ? 9 : 2 })
      }
    });

    // Action
    const usage = await licenseService.getInstanceSeatUsage();

    // Assert
    expect(usage.identitiesUsed).toBe(9);
  });

  test("should refuse an org that does not exist on cloud", async () => {
    // Setup
    const { licenseService } = await buildLicense();

    // Action
    const result = licenseService.getSeatUsage(OTHER_ROOT.id.replace("3", "5"));

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
    await expect(result).rejects.toThrow("Two usage counters were given for 'user_identities'");
  });
});
