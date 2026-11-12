import { InstanceType } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../testing/build-license";
import { FakeLicenseServer } from "../testing/fake-license-server";
import { FakeUsageCounter } from "../testing/fake-usage-counter";
import { enterprisePlan } from "../testing/test-features";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (licenseServer: FakeLicenseServer, dimension: string) =>
  licenseServer.snapshots.filter((s) => s.snapshot.dimension_key === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("LicenseService.getPlan", () => {
  test("should queue every meter once per interval when a paid plan is read, and nothing for a plan with no slug", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: null });
    const { licenseService, queue } = await buildLicense({
      licenseServer,
      counters: [new FakeUsageCounter(Meter.UserIdentities)]
    });

    // Action
    await licenseService.getPlan(ROOT.id);
    await licenseService.getPlan(ROOT.id);
    await licenseService.getPlan(OTHER_ROOT.id);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    const orgsQueued = queue.jobs.map((j) => (j.data as { orgId: string }).orgId);
    expect(orgsQueued).toEqual([ROOT.id]);
  });
});

describe("UsageMeteringService.syncSeats", () => {
  test("should report the root's member count and refresh its plan", async () => {
    // Setup
    const members = new FakeUsageCounter(Meter.UserIdentities).set(ROOT.id, 6);
    const { usageMeteringService, licenseService, queue, licenseServer } = await buildLicense({
      counters: [members]
    });
    await licenseService.getPlan(ROOT.id);
    licenseServer.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await usageMeteringService.syncSeats(SUB_ORG_ID);
    await queue.drain();

    // Assert
    expect(snapshotsFor(licenseServer, Meter.UserIdentities.key)).toEqual([[ROOT.id, 6]]);
    expect((await licenseService.getPlan(ROOT.id)).slug).toBe("pro");
  });

  test("should not throw when the refresh fails on an online self-hosted license", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = {
      ...licenseServer.instance,
      instanceType: InstanceType.EnterpriseOnPrem,
      features: enterprisePlan()
    };
    licenseServer.online = true;
    licenseServer.refreshFailure = new Error("License Server unreachable");
    const { usageMeteringService } = await buildLicense({ licenseServer });

    // Action
    const result = usageMeteringService.syncSeats(ROOT.id);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});
