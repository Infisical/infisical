import { InternalServerError } from "@app/lib/errors";
import { QueueName } from "@app/queue";

import { InstanceType } from "../model/license-types";
import { ActiveCerts, IdentitiesMeter, UserIdentities } from "../model/metered-features";
import { UsageReportError } from "../model/usage-report";
import { buildLicense, OTHER_ROOT, ROOT, SUB_ORG_ID } from "../testing/build-license";
import { enterprisePlan, FakeLicenseHooks } from "../testing/fake-license-hooks";
import { FakeUsageCounter } from "../testing/fake-usage-counter";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const snapshotsFor = (hooks: FakeLicenseHooks, dimension: string) =>
  hooks.snapshots.filter((s) => s.snapshot.dimension_key === dimension).map((s) => [s.orgId, s.snapshot.value]);

describe("UsageService.emit", () => {
  test("should queue nothing when metering is disabled", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.meteringEnabled = false;
    const { license, queue } = await buildLicense({ hooks });

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(queue.jobs).toEqual([]);
    expect(hooks.snapshots).toEqual([]);
  });

  test("should replace a waiting event for the same org and dimension", async () => {
    // Setup
    const { license, queue } = await buildLicense();

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    license.emit(ROOT.id, UserIdentities.key);
    license.emit(ROOT.id, IdentitiesMeter.key);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(queue.jobs.map((j) => (j.data as { dimensionKey: string }).dimensionKey)).toEqual([
      UserIdentities.key,
      IdentitiesMeter.key
    ]);
  });

  test("should queue a usage event that is retried with backoff", async () => {
    // Setup
    const { license, queue } = await buildLicense();

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(queue.jobs[0].opts).toMatchObject({ delay: 5000, attempts: 5, backoff: { type: "exponential" } });
  });
});

describe("UsageService worker", () => {
  test("should report the counter's value and record it", async () => {
    // Setup
    const counter = new FakeUsageCounter(UserIdentities).set(ROOT.id, 4);
    const { license, queue, hooks } = await buildLicense({ counters: [counter] });

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, UserIdentities.key)).toEqual([[ROOT.id, 4]]);
  });

  test("should not report a value the server already has", async () => {
    // Setup
    const counter = new FakeUsageCounter(UserIdentities).set(ROOT.id, 4);
    const { license, queue, hooks } = await buildLicense({ counters: [counter] });
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, UserIdentities.key)).toHaveLength(1);
  });

  test("should report nothing for an org on cloud whose plan has no slug", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: null });
    const counter = new FakeUsageCounter(UserIdentities).set(ROOT.id, 4);
    const { license, queue } = await buildLicense({ hooks, counters: [counter] });

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(hooks.snapshots).toEqual([]);
  });

  test("should report an org-tree meter at the root, and an org meter at the org that changed", async () => {
    // Setup
    const certs = new FakeUsageCounter(ActiveCerts, "org-tree").set(ROOT.id, 9);
    const users = new FakeUsageCounter(UserIdentities).set(SUB_ORG_ID, 2);
    const { license, queue, hooks } = await buildLicense({ counters: [certs, users] });

    // Action
    license.emit(SUB_ORG_ID, ActiveCerts.key);
    license.emit(SUB_ORG_ID, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, ActiveCerts.key)).toEqual([[ROOT.id, 9]]);
    expect(snapshotsFor(hooks, UserIdentities.key)).toEqual([[SUB_ORG_ID, 2]]);
  });

  test("should report under the instance on self-hosted, counting the whole instance", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    const counter = new FakeUsageCounter(UserIdentities).set(null, 12);
    const { license, queue } = await buildLicense({ hooks, counters: [counter] });

    // Action
    license.emit(ROOT.id, UserIdentities.key);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, UserIdentities.key)).toEqual([["self-hosted", 12]]);
    expect(hooks.snapshots[0].snapshot.source).toBe("self-hosted");
  });

  test("should drop an event for a dimension nothing counts", async () => {
    // Setup
    const { license, queue, hooks } = await buildLicense();

    // Action
    license.emit(ROOT.id, "unknown_dimension");
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
      const counter = new FakeUsageCounter(UserIdentities).set(ROOT.id, 4);
      const { license, queue } = await buildLicense({ hooks, counters: [counter] });
      license.emit(ROOT.id, UserIdentities.key);
      await queue.drain();

      // Action
      license.emit(ROOT.id, UserIdentities.key);
      await queue.drain();

      // Assert
      expect(snapshotsFor(hooks, UserIdentities.key)).toEqual([[ROOT.id, 4]]);
    }
  );

  test("should fail the job on any other error, so the queue retries it", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.failNextReports.push(new UsageReportError(500, "boom"));
    const counter = new FakeUsageCounter(UserIdentities).set(ROOT.id, 4);
    const { license, queue } = await buildLicense({ hooks, counters: [counter] });
    license.emit(ROOT.id, UserIdentities.key);

    // Action
    const result = queue.drain();

    // Assert
    await expect(result).rejects.toThrow("usage report failed with 500");
  });

  test("should re-emit each meter once at the instance for the daily flush, and only for online self-hosted", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    const { registered } = await buildLicense({ hooks });
    const cloud = await buildLicense();

    // Action
    const enabled = [registered, cloud.registered];

    // Assert
    expect(enabled).toEqual([["license-usage-flush:true"], ["license-usage-flush:false"]]);
  });
});

describe("UsageService.recordMeteringEvents", () => {
  test("should queue one retried job per dimension and never debounce", async () => {
    // Setup
    const { license, queue } = await buildLicense();
    const at = new Date("2026-01-01T00:00:00Z");

    // Action
    license.recordMeteringEvents(ROOT.id, [
      { eventId: "e1", dimensionKey: "a", quantity: 1, occurredAt: at },
      { eventId: "e2", dimensionKey: "b", quantity: 1, occurredAt: at },
      { eventId: "e3", dimensionKey: "a", quantity: 1, occurredAt: at }
    ]);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(queue.jobs.map((j) => j.queue)).toEqual([QueueName.MeteringEvent, QueueName.MeteringEvent]);
    expect(queue.jobs[0].opts).toMatchObject({ attempts: 10 });
    expect((queue.jobs[0].data as { events: unknown[] }).events).toHaveLength(2);
  });

  test("should report events at the triggering org on cloud, and drop a batch the server refuses with a 422", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    const { license, queue } = await buildLicense({ hooks });
    const at = new Date("2026-01-01T00:00:00Z");
    license.recordMeteringEvents(ROOT.id, [{ eventId: "e1", dimensionKey: "a", quantity: 1, occurredAt: at }]);
    await queue.drain();
    hooks.failNextReports.push(new UsageReportError(422, "not metered"));
    license.recordMeteringEvents(ROOT.id, [{ eventId: "e2", dimensionKey: "a", quantity: 1, occurredAt: at }]);

    // Action
    await queue.drain();

    // Assert
    expect(hooks.events.map((e) => [e.orgId, e.event.event_id])).toEqual([[ROOT.id, "e1"]]);
  });
});

describe("UsageService.getSeatUsage", () => {
  test("should count the root org's tree on cloud", async () => {
    // Setup
    const members = new FakeUsageCounter(UserIdentities).set(ROOT.id, 3);
    const identities = new FakeUsageCounter(IdentitiesMeter).set(ROOT.id, 7);
    const { license } = await buildLicense({ counters: [members, identities] });

    // Action
    const usage = await license.getSeatUsage(SUB_ORG_ID);

    // Assert
    expect(usage).toEqual({ membersUsed: 3, identitiesUsed: 7 });
  });

  test("should refuse a new member once the plan's cap is reached, naming the provisioning method", async () => {
    // Setup
    const identities = new FakeUsageCounter(IdentitiesMeter).set(ROOT.id, 5);
    const { license } = await buildLicense({ counters: [identities] });

    // Action
    const result = license.assertSeatAvailable({ orgId: ROOT.id, identityLimit: 5, via: "oidc" });

    // Assert
    await expect(result).rejects.toThrow("Failed to create new member via OIDC due to member limit reached.");
  });

  test("should refuse an org that does not exist on cloud", async () => {
    // Setup
    const { license } = await buildLicense();

    // Action
    const result = license.getSeatUsage(OTHER_ROOT.id.replace("3", "5"));

    // Assert
    await expect(result).rejects.toThrow("not found");
  });
});

describe("SubscriptionService.syncSeats", () => {
  test("should report the root's member count and refresh its plan", async () => {
    // Setup
    const members = new FakeUsageCounter(UserIdentities).set(ROOT.id, 6);
    const { license, queue, hooks } = await buildLicense({ counters: [members] });
    await license.getPlan(ROOT.id);
    hooks.plans.set(ROOT.id, { ...enterprisePlan(), slug: "pro" });

    // Action
    await license.syncSeats(SUB_ORG_ID);
    await queue.drain();

    // Assert
    expect(snapshotsFor(hooks, UserIdentities.key)).toEqual([[ROOT.id, 6]]);
    expect((await license.getPlan(ROOT.id)).slug).toBe("pro");
  });

  test("should not throw when the refresh fails on an online self-hosted license", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem, features: enterprisePlan() };
    hooks.online = true;
    hooks.refreshFailure = new Error("License Server unreachable");
    const { license } = await buildLicense({ hooks });

    // Action
    const result = license.syncSeats(ROOT.id);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });
});

describe("SubscriptionService.cancelSubscription", () => {
  test("should cancel on cloud and drop the cached plan", async () => {
    // Setup
    const { license, hooks } = await buildLicense();
    await license.getPlan(ROOT.id);

    // Action
    await license.cancelSubscription(ROOT.id);

    // Assert
    expect(hooks.cancellations).toEqual([ROOT.id]);
    await license.getPlan(ROOT.id);
    expect(hooks.planFetches).toHaveLength(2);
  });

  test("should do nothing on self-hosted", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    hooks.instance = { ...hooks.instance, instanceType: InstanceType.EnterpriseOnPrem };
    const { license } = await buildLicense({ hooks });

    // Action
    await license.cancelSubscription(ROOT.id);

    // Assert
    expect(hooks.cancellations).toEqual([]);
  });

  test("should treat a 4xx as nothing to cancel", async () => {
    // Setup
    const { BadRequestError } = await import("@app/lib/errors");
    const hooks = new FakeLicenseHooks();
    hooks.cancelFailure = new BadRequestError({ message: "no subscription" });
    const { license } = await buildLicense({ hooks });

    // Action
    const result = license.cancelSubscription(ROOT.id);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  test("should throw any other failure and keep the cached plan", async () => {
    // Setup
    const hooks = new FakeLicenseHooks();
    const { license } = await buildLicense({ hooks });
    await license.getPlan(ROOT.id);
    hooks.cancelFailure = new InternalServerError({ message: "License Server failed" });

    // Action
    const result = license.cancelSubscription(ROOT.id);

    // Assert
    await expect(result).rejects.toThrow("License Server failed");
    await license.getPlan(ROOT.id);
    expect(hooks.planFetches).toHaveLength(1);
  });
});

describe("LicenseModule", () => {
  test("should refuse two counters for one dimension", async () => {
    // Setup
    const counters = [new FakeUsageCounter(UserIdentities), new FakeUsageCounter(UserIdentities)];

    // Action
    const result = buildLicense({ counters });

    // Assert
    await expect(result).rejects.toThrow("Two usage counters were registered for 'user_identities'");
  });
});
