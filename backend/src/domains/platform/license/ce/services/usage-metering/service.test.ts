import { InstanceType } from "../../models/instance-entitlements";
import { Meter } from "../../models/meter";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../../testing/build-license";
import { FakeLicenseServer } from "../../testing/fake-license-server";
import { FakeUsageCounter } from "../../testing/fake-usage-counter";
import { enterprisePlan } from "../../testing/test-features";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (licenseServer: FakeLicenseServer, dimension: string) =>
  licenseServer.snapshots.filter((s) => s.snapshot.dimensionKey === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("LicenseService.getPlan", () => {
  test("should queue each seat meter once per interval when a paid plan is read, and nothing for a plan with no slug", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.plans.set(OTHER_ROOT.id, { ...enterprisePlan(), slug: null });
    const { licenseService, queue } = await buildLicense({ licenseServer });

    // Action
    await licenseService.getPlan(ROOT.id);
    await licenseService.getPlan(ROOT.id);
    await licenseService.getPlan(OTHER_ROOT.id);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    const orgsQueued = queue.jobs.map((j) => (j.data as { orgId: string }).orgId);
    expect(orgsQueued).toEqual([ROOT.id, ROOT.id]);
  });
});

describe("UsageMeteringService.syncSeats", () => {
  test("should report the root's member count and refresh its plan", async () => {
    // Setup
    const { usageMeteringService, licenseService, queue, licenseServer } = await buildLicense({
      organizations: { countBillableOrgActors: async (orgId) => ({ users: orgId === ROOT.id ? 6 : 0, identities: 0 }) }
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

describe("UsageMeteringService.getUsageBreakdown", () => {
  test("should break a product meter down for the exact scope asked, even on self-hosted", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.instance = { ...licenseServer.instance, instanceType: InstanceType.EnterpriseOnPrem };
    const counter = new FakeUsageCounter(Meter.SecretIdentities).setBreakdown(ROOT.id, {
      total: 3,
      users: 1,
      rows: [{ orgId: SUB_ORG_ID, projectId: "project-1", count: 2 }]
    });
    const { usageMeteringService } = await buildLicense({ licenseServer, counters: [counter] });

    // Action
    const breakdown = await usageMeteringService.getUsageBreakdown(Meter.SecretIdentities, ROOT.id);

    // Assert
    expect(breakdown).toEqual({ total: 3, users: 1, rows: [{ orgId: SUB_ORG_ID, projectId: "project-1", count: 2 }] });
  });

  test("should return null for a meter nothing counts", async () => {
    // Setup
    const { usageMeteringService } = await buildLicense();

    // Action
    const breakdown = await usageMeteringService.getUsageBreakdown(Meter.InternalCas, ROOT.id);

    // Assert
    expect(breakdown).toBeNull();
  });

  test("should split identities into unattributed users and machine identities by owner", async () => {
    // Setup
    const { usageMeteringService } = await buildLicense({
      organizations: {
        countBillableOrgActors: async () => ({ users: 4, identities: 2 }),
        getBillableIdentityOwnershipBreakdown: async () => [
          { orgId: ROOT.id, projectId: null, count: 1 },
          { orgId: SUB_ORG_ID, projectId: "project-1", count: 1 }
        ]
      }
    });

    // Action
    const [identities, users] = await Promise.all([
      usageMeteringService.getUsageBreakdown(Meter.Identities, ROOT.id),
      usageMeteringService.getUsageBreakdown(Meter.UserIdentities, ROOT.id)
    ]);

    // Assert
    expect(identities).toEqual({
      total: 6,
      users: 4,
      rows: [
        { orgId: ROOT.id, projectId: null, count: 1 },
        { orgId: SUB_ORG_ID, projectId: "project-1", count: 1 }
      ]
    });
    expect(users).toEqual({ total: 4, users: 4, rows: [] });
  });
});
