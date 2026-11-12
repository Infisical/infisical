import { InstanceType } from "../../model/instance-entitlements";
import { Meter } from "../../model/meter";
import { buildLicense, ROOT, SUB_ORG_ID } from "../../testing/build-license";
import { FakeLicenseServer } from "../../testing/fake-license-server";
import { FakeUsageCounter } from "../../testing/fake-usage-counter";
import { enterprisePlan } from "../../testing/test-features";
import { UsageQueues } from "../helpers/usage-queue";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (licenseServer: FakeLicenseServer, dimension: string) =>
  licenseServer.snapshots.filter((s) => s.snapshot.dimensionKey === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("UsageReportWorker.handleUsageEvent", () => {
  test("should report the counter's value and record it", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.SecretIdentities).set(ROOT.id, 4);
    const { usageMeteringService, queue, licenseServer } = await buildLicense({ counters: [counter] });

    // Action
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.SecretIdentities.key)).toEqual([[ROOT.id, 4]]);
  });

  test("should send a recount as a new observation when a retry follows a lost reply", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.ActiveCerts).set(ROOT.id, 9);
    const { usageMeteringService, queue, licenseServer } = await buildLicense({ counters: [counter] });
    licenseServer.loseNextReplies = 1;
    usageMeteringService.emit(ROOT.id, Meter.ActiveCerts);
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
    expect(sent.map((s) => s.observedAt.getTime())).toEqual([1_700_000_005_000, 1_700_000_015_000]);
  });

  test("should not report a value the server already has", async () => {
    // Setup
    const counter = new FakeUsageCounter(Meter.SecretIdentities).set(ROOT.id, 4);
    const { usageMeteringService, queue, licenseServer } = await buildLicense({ counters: [counter] });
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
    await queue.drain();

    // Action
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.SecretIdentities.key)).toHaveLength(1);
  });

  test("should report nothing for an org on cloud whose plan has no slug", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(ROOT.id, { ...enterprisePlan(), slug: null });
    const counter = new FakeUsageCounter(Meter.SecretIdentities).set(ROOT.id, 4);
    const { usageMeteringService, queue } = await buildLicense({ licenseServer, counters: [counter] });

    // Action
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots).toEqual([]);
  });

  test("should report an org-tree meter at the root, and an org meter at the org that changed", async () => {
    // Setup
    const certs = new FakeUsageCounter(Meter.ActiveCerts).set(ROOT.id, 9);
    const users = new FakeUsageCounter(Meter.SecretIdentities).set(SUB_ORG_ID, 2);
    const { usageMeteringService, queue, licenseServer } = await buildLicense({ counters: [certs, users] });

    // Action
    usageMeteringService.emit(SUB_ORG_ID, Meter.ActiveCerts);
    usageMeteringService.emit(SUB_ORG_ID, Meter.SecretIdentities);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.ActiveCerts.key)).toEqual([[ROOT.id, 9]]);
    expect(snapshotsFor(licenseServer, Meter.SecretIdentities.key)).toEqual([[SUB_ORG_ID, 2]]);
  });

  test("should report under the instance on self-hosted, counting the whole instance", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = {
      ...licenseServer.instance,
      instanceType: InstanceType.EnterpriseOnPrem,
      features: enterprisePlan()
    };
    const counter = new FakeUsageCounter(Meter.SecretIdentities).set(null, 12);
    const { usageMeteringService, queue } = await buildLicense({ licenseServer, counters: [counter] });

    // Action
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.SecretIdentities.key)).toEqual([["self-hosted", 12]]);
    expect(licenseServer.snapshots[0].snapshot.source).toBe("self-hosted");
  });

  test("should drop a queued event for a dimension nothing counts, as an older pod may send", async () => {
    // Setup
    const { queue, licenseServer } = await buildLicense();

    // Action
    await queue.queue(UsageQueues.usageEvent, UsageQueues.usageEventJob, {
      orgId: ROOT.id,
      dimensionKey: "unknown_dimension"
    });
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots).toEqual([]);
  });

  test.each(["no-license", "not-priced"] as const)(
    "should drop a report the server answers with a final %s, and send the value again next time",
    async (outcome) => {
      // Setup
      const licenseServer = new FakeLicenseServer();
      licenseServer.failNextReports.push(outcome);
      const counter = new FakeUsageCounter(Meter.SecretIdentities).set(ROOT.id, 4);
      const { usageMeteringService, queue } = await buildLicense({ licenseServer, counters: [counter] });
      usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
      await queue.drain();

      // Action
      usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);
      await queue.drain();

      // Assert
      expect(snapshotsFor(licenseServer, Meter.SecretIdentities.key)).toEqual([[ROOT.id, 4]]);
    }
  );

  test("should fail the job on any other error, so the queue retries it", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.failNextReports.push(new Error("License Server unavailable"));
    const counter = new FakeUsageCounter(Meter.SecretIdentities).set(ROOT.id, 4);
    const { usageMeteringService, queue } = await buildLicense({ licenseServer, counters: [counter] });
    usageMeteringService.emit(ROOT.id, Meter.SecretIdentities);

    // Action
    const result = queue.drain();

    // Assert
    await expect(result).rejects.toThrow("License Server unavailable");
  });
});

describe("UsageReportWorker.flushInstanceUsage", () => {
  test("should report every meter once under the instance, counting the whole instance", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = {
      ...licenseServer.instance,
      instanceType: InstanceType.EnterpriseOnPrem,
      features: enterprisePlan()
    };
    const counters = [
      new FakeUsageCounter(Meter.SecretIdentities).set(null, 12),
      new FakeUsageCounter(Meter.ActiveCerts).set(null, 4)
    ];
    const organizations = { countBillableOrgActors: async () => ({ users: 5, identities: 2 }) };
    const { cronHandlers, queue } = await buildLicense({ licenseServer, counters, organizations });

    // Action
    await cronHandlers.get("license-usage-flush")!();
    await queue.drain();

    // Assert
    expect(licenseServer.snapshots.map((s) => [s.orgId, s.snapshot.dimensionKey, s.snapshot.value])).toEqual([
      ["self-hosted", Meter.Identities.key, 7],
      ["self-hosted", Meter.UserIdentities.key, 5],
      ["self-hosted", Meter.SecretIdentities.key, 12],
      ["self-hosted", Meter.ActiveCerts.key, 4]
    ]);
  });
});

describe("LicenseModule", () => {
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

  test("should refuse two counters for one dimension", async () => {
    // Setup
    const counters = [new FakeUsageCounter(Meter.SecretIdentities), new FakeUsageCounter(Meter.SecretIdentities)];

    // Action
    const result = buildLicense({ counters });

    // Assert
    await expect(result).rejects.toThrow("Two usage counters were given for 'secret_identities'");
  });
});
