import { QueueName } from "@app/queue";

import { Meter } from "../model/meter";
import { buildLicense, ROOT } from "../testing/build-license";
import { FakeLicenseServer } from "../testing/fake-license-server";
import { UsageReportError } from "./license-server-types/usage-reports";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

describe("UsageQueue.emit", () => {
  test("should queue nothing when metering is disabled", async () => {
    // Setup
    const licenseServer = new FakeLicenseServer();
    licenseServer.meteringEnabled = false;
    const { licenseService, queue } = await buildLicense({ licenseServer });

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await queue.drain();

    // Assert
    expect(queue.jobs).toEqual([]);
    expect(licenseServer.snapshots).toEqual([]);
  });

  test("should replace a waiting event for the same org and dimension", async () => {
    // Setup
    const { licenseService, queue } = await buildLicense();

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    licenseService.emit(ROOT.id, Meter.Identities.key);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(queue.jobs.map((j) => (j.data as { dimensionKey: string }).dimensionKey)).toEqual([
      Meter.UserIdentities.key,
      Meter.Identities.key
    ]);
  });

  test("should queue a usage event that is retried with backoff", async () => {
    // Setup
    const { licenseService, queue } = await buildLicense();

    // Action
    licenseService.emit(ROOT.id, Meter.UserIdentities.key);
    await new Promise((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(queue.jobs[0].opts).toMatchObject({ delay: 5000, attempts: 5, backoff: { type: "exponential" } });
  });
});

describe("UsageQueue.recordMeteringEvents", () => {
  test("should queue one retried job per dimension and never debounce", async () => {
    // Setup
    const { licenseService, queue } = await buildLicense();
    const at = new Date("2026-01-01T00:00:00Z");

    // Action
    licenseService.recordMeteringEvents(ROOT.id, [
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
    const licenseServer = new FakeLicenseServer();
    const { licenseService, queue } = await buildLicense({ licenseServer });
    const at = new Date("2026-01-01T00:00:00Z");
    licenseService.recordMeteringEvents(ROOT.id, [{ eventId: "e1", dimensionKey: "a", quantity: 1, occurredAt: at }]);
    await queue.drain();
    licenseServer.failNextReports.push(new UsageReportError(422, "not metered"));
    licenseService.recordMeteringEvents(ROOT.id, [{ eventId: "e2", dimensionKey: "a", quantity: 1, occurredAt: at }]);

    // Action
    await queue.drain();

    // Assert
    expect(licenseServer.events.map((e) => [e.orgId, e.event.event_id])).toEqual([[ROOT.id, "e1"]]);
  });
});
