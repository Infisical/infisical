import crypto from "node:crypto";

import { z } from "zod";

import { TEventInput } from "../../models/emitted-event";
import { OutboxClaim } from "../../models/outbox-claim";
import { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS, OutboxEntry } from "../../models/outbox-entry";
import { buildEvents } from "../../testing/build-events";
import { TEventConsumer, TEvent } from "../dependencies";

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: loggerWarn, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const EVENT_TYPE = "approval.workflow.request_opened";
const HOUR_MS = 60 * 60_000;

const makePayload = (overrides?: Record<string, unknown>) => ({
  orgId: "11111111-1111-1111-1111-111111111111",
  resourceType: "approval.workflow",
  resourceId: "policy-1",
  targetIds: ["req-1"],
  ...overrides
});

const makeEvent = (overrides?: Partial<TEventInput>): TEventInput => ({
  id: crypto.randomUUID(),
  type: EVENT_TYPE,
  data: makePayload(),
  ...overrides
});

const deliverAll: TEventConsumer["handle"] = async (events) =>
  events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }));

const makeConsumer = (overrides?: Partial<TEventConsumer>): TEventConsumer => ({
  name: "alert",
  dataSchema: z.object({ targetIds: z.array(z.string()).min(1) }),
  subscribesTo: (type: string) => type === EVENT_TYPE,
  handle: deliverAll,
  ...overrides
});

// One consumer named "alert" with `count` events waiting for it.
const buildWithPending = async (handle: TEventConsumer["handle"], count = 1) => {
  const built = buildEvents({ consumers: [makeConsumer({ handle })] });
  await built.eventEmitterService.emit(Array.from({ length: count }, () => makeEvent()));
  return built;
};

beforeEach(() => {
  loggerWarn.mockClear();
});

describe("EventDeliveryService.drain", () => {
  test("should deliver what is waiting and stop when nothing is left", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await buildWithPending(deliverAll, 2);

    // Action
    const result = await eventDeliveryService.drain("alert");

    // Assert
    expect(result).toEqual({ handled: 2, unknownConsumer: false });
    expect(outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Delivered, attempts: 0, lockToken: null },
      { status: EventOutboxStatus.Delivered, attempts: 0, lockToken: null }
    ]);
  });

  test("should hand the consumer each entry as a CloudEvent", async () => {
    // Setup
    let received: TEvent[] = [];
    const { eventEmitterService, eventDeliveryService } = buildEvents({
      consumers: [
        makeConsumer({
          handle: async (events) => {
            received = events;
            return deliverAll(events);
          }
        })
      ]
    });
    const event = makeEvent({ time: new Date("2026-08-20T17:42:31.000Z") });
    await eventEmitterService.emit([event]);

    // Action
    await eventDeliveryService.drain("alert");

    // Assert
    expect(received).toEqual([
      {
        specversion: "1.0",
        id: event.id,
        source: "urn:infisical:approval",
        type: EVENT_TYPE,
        time: "2026-08-20T17:42:31.000Z",
        data: makePayload(),
        isFinalAttempt: false
      }
    ]);
  });

  test("should retry the whole batch when the consumer throws", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await buildWithPending(async () => {
      throw new Error("provider exploded");
    }, 2);

    // Action
    await eventDeliveryService.drain("alert");

    // Assert
    expect(outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Retry, attempts: 1, lastError: "provider exploded" },
      { status: EventOutboxStatus.Retry, attempts: 1, lastError: "provider exploded" }
    ]);
  });

  test("should retry an entry the consumer returned no result for", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await buildWithPending(async () => []);

    // Action
    await eventDeliveryService.drain("alert");

    // Assert
    expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Retry, attempts: 1 }]);
  });

  test("should not hand an entry out again before its backoff has passed", async () => {
    // Setup
    const handle = vi.fn<TEventConsumer["handle"]>(async (events) =>
      events.map((event) => ({ id: event.id, status: EventResultStatus.Retry }))
    );
    const { eventDeliveryService } = await buildWithPending(handle);
    await eventDeliveryService.drain("alert");

    // Action
    const result = await eventDeliveryService.drain("alert");

    // Assert
    expect(result.handled).toBe(0);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  test("should tell the consumer about its last attempt, and fail the entry for good after it", async () => {
    // Setup
    const received: boolean[] = [];
    const { eventDeliveryService, outboxEntryStore, metrics } = await buildWithPending(async (events) => {
      received.push(...events.map((event) => event.isFinalAttempt));
      return events.map((event) => ({ id: event.id, status: EventResultStatus.Retry, error: "slack 502" }));
    }, 2);
    outboxEntryStore.patch(outboxEntryStore.all()[1].id, { attempts: MAX_OUTBOX_ATTEMPTS - 1 });

    // Action
    await eventDeliveryService.drain("alert");

    // Assert
    expect(received).toEqual([false, true]);
    expect(outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Retry, attempts: 1 },
      { status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS, lastError: "slack 502" }
    ]);
    expect(metrics.exhausted).toEqual([{ consumer: "alert", count: 1 }]);
  });

  // A short settle means the batch went out twice. This log is the only place that shows up.
  test("should report a claim that was taken away mid-delivery, leaving the new owner's entry alone", async () => {
    // Setup
    const built = buildEvents();
    built.consumerRegistry.register(
      makeConsumer({
        handle: async (events) => {
          built.outboxEntryStore.patch(built.outboxEntryStore.all()[0].id, { lockToken: "another-worker" });
          return deliverAll(events);
        }
      })
    );
    await built.eventEmitterService.emit([makeEvent(), makeEvent()]);

    // Action
    await built.eventDeliveryService.drain("alert");

    // Assert
    expect(loggerWarn).toHaveBeenCalledTimes(1);
    expect(loggerWarn.mock.calls[0][0]).toContain("settled 1 of 2 row(s)");
    expect(built.outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Processing, lockToken: "another-worker" },
      { status: EventOutboxStatus.Delivered }
    ]);
  });

  test("should say nothing when every claimed entry settles", async () => {
    // Setup
    const { eventDeliveryService } = await buildWithPending(deliverAll);

    // Action
    await eventDeliveryService.drain("alert");

    // Assert
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  test("should leave entries untouched when no consumer is registered under the name", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await buildWithPending(deliverAll);

    // Action
    const result = await eventDeliveryService.drain("gone");

    // Assert
    expect(result).toEqual({ handled: 0, unknownConsumer: true });
    expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Pending }]);
  });

  describe("on a clock the test controls", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // A slow batch has to keep its claim fresh, or the sweeper hands it to a second worker mid-delivery.
    test("should keep the claim fresh while the consumer is still handling a batch", async () => {
      // Setup
      let release: () => void = () => {};
      const { eventDeliveryService, outboxEntryStore } = await buildWithPending(
        (events) =>
          new Promise((resolve) => {
            release = () => resolve(events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered })));
          })
      );
      const draining = eventDeliveryService.drain("alert");
      await vi.advanceTimersByTimeAsync(0);
      const claimedAt = outboxEntryStore.all()[0].lockedAt as Date;

      // Action
      await vi.advanceTimersByTimeAsync(10 * 60_000);

      // Assert
      expect((outboxEntryStore.all()[0].lockedAt as Date).getTime()).toBeGreaterThan(claimedAt.getTime() + 5 * 60_000);
      release();
      await draining;
      expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Delivered, lockedAt: null }]);
    });

    // Otherwise a handle() that never settles keeps the heartbeat alive and blocks every later flush for that
    // consumer until a restart.
    test("should give up on a consumer that never settles and retry the batch", async () => {
      // Setup
      const { eventDeliveryService, outboxEntryStore } = await buildWithPending(() => new Promise(() => {}), 2);

      // Action
      const draining = eventDeliveryService.drain("alert");
      await vi.advanceTimersByTimeAsync(30 * 60_000);

      // Assert
      await expect(draining).resolves.toEqual({ handled: 2, unknownConsumer: false });
      const rows = outboxEntryStore.all();
      expect(rows.map((row) => row.status)).toEqual([EventOutboxStatus.Retry, EventOutboxStatus.Retry]);
      expect(rows[0].lastError).toContain("did not finish handling the batch");
    });

    // The consumer already sent by now, so a transient failure must not leave the entries to the sweeper, which
    // would notify again ten minutes later.
    test("should try again when saving the results fails once", async () => {
      // Setup
      const { eventDeliveryService, outboxEntryStore } = await buildWithPending(deliverAll);
      const save = outboxEntryStore.saveSettled.bind(outboxEntryStore);
      let saves = 0;
      outboxEntryStore.saveSettled = async (claim: OutboxClaim) => {
        saves += 1;
        if (saves === 1) throw new Error("connection reset");
        return save(claim);
      };

      // Action
      const draining = eventDeliveryService.drain("alert");
      await vi.advanceTimersByTimeAsync(1_000);

      // Assert
      await expect(draining).resolves.toEqual({ handled: 1, unknownConsumer: false });
      expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Delivered }]);
    });

    test("should stop after three failed saves so the sweeper can take over", async () => {
      // Setup
      const { eventDeliveryService, outboxEntryStore } = await buildWithPending(deliverAll);
      let saves = 0;
      outboxEntryStore.saveSettled = async () => {
        saves += 1;
        throw new Error("connection reset");
      };

      // Action
      const draining = eventDeliveryService.drain("alert");
      // Attach the handler before advancing so the rejection has a listener when the retries run out.
      const outcome = expect(draining).rejects.toThrow("connection reset");
      await vi.advanceTimersByTimeAsync(5_000);

      // Assert
      await outcome;
      expect(saves).toBe(3);
      expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Processing }]);
    });
  });
});

describe("EventDeliveryService.sweepStaleClaims", () => {
  const claimAll = async (count: number) => {
    const built = await buildWithPending(deliverAll, count);
    await built.outboxEntryStore.claimBatch("alert", count);
    return built;
  };

  test("should back off a stale claim, fail an exhausted one and leave a live one alone", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await claimAll(3);
    const [, stale, exhausted] = outboxEntryStore.all();
    const longAgo = new Date(Date.now() - HOUR_MS);
    outboxEntryStore.patch(stale.id, { lockedAt: longAgo });
    outboxEntryStore.patch(exhausted.id, { lockedAt: longAgo, attempts: MAX_OUTBOX_ATTEMPTS - 1 });

    // Action
    await eventDeliveryService.sweepStaleClaims();

    // Assert
    const [live, retried, failed] = outboxEntryStore.all();
    expect(live.status).toBe(EventOutboxStatus.Processing);
    expect(retried).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lockedAt: null, lockToken: null });
    expect(retried.nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(failed).toMatchObject({ status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS });
  });

  // An entry the sweeper gives up on is just as lost, so the exhausted metric has to count it too.
  test("should count the entries it gives up on, per consumer", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore, metrics } = await claimAll(2);
    outboxEntryStore
      .all()
      .forEach((row) =>
        outboxEntryStore.patch(row.id, { lockedAt: new Date(Date.now() - HOUR_MS), attempts: MAX_OUTBOX_ATTEMPTS - 1 })
      );

    // Action
    await eventDeliveryService.sweepStaleClaims();

    // Assert
    expect(metrics.exhausted).toEqual([{ consumer: "alert", count: 2 }]);
  });

  test("should record nothing when no claim is stale", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore, metrics } = await claimAll(1);

    // Action
    await eventDeliveryService.sweepStaleClaims();

    // Assert
    expect(metrics.exhausted).toEqual([]);
    expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Processing }]);
  });

  describe("with more stale claims than one batch holds", () => {
    const staleEntry = () =>
      OutboxEntry.restore({
        id: crypto.randomUUID(),
        consumer: "alert",
        eventId: crypto.randomUUID(),
        eventType: EVENT_TYPE,
        payload: {},
        occurredAt: new Date(),
        status: EventOutboxStatus.Processing,
        attempts: 0,
        lastError: null
      });

    const buildSweep = (batchSizes: number[]) => {
      const { eventDeliveryService, outboxEntryStore } = buildEvents();
      const limits: number[] = [];
      outboxEntryStore.lockStaleClaims = async ({ limit }) => {
        limits.push(limit);
        return Array.from({ length: batchSizes[limits.length - 1] ?? limit }, staleEntry);
      };
      return { eventDeliveryService, limits };
    };

    test("should keep sweeping while batches come back full, and stop at a bound", async () => {
      // Setup
      const { eventDeliveryService, limits } = buildSweep([]);

      // Action
      await eventDeliveryService.sweepStaleClaims();

      // Assert
      expect(limits).toEqual(Array.from({ length: 10 }, () => 1_000));
    });

    test("should stop after the first batch that comes back short", async () => {
      // Setup
      const { eventDeliveryService, limits } = buildSweep([1_000, 999, 1_000]);

      // Action
      await eventDeliveryService.sweepStaleClaims();

      // Assert
      expect(limits).toHaveLength(2);
    });
  });
});

describe("EventDeliveryService.pruneTerminalRows", () => {
  test("should delete delivered entries older than a day and failed ones older than thirty", async () => {
    // Setup
    const { eventDeliveryService, outboxEntryStore } = await buildWithPending(deliverAll, 5);
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * HOUR_MS);
    const [oldDelivered, freshDelivered, oldFailed, recentFailed, oldPending] = outboxEntryStore.all();
    outboxEntryStore.patch(oldDelivered.id, { status: EventOutboxStatus.Delivered, updatedAt: daysAgo(2) });
    outboxEntryStore.patch(freshDelivered.id, { status: EventOutboxStatus.Delivered });
    outboxEntryStore.patch(oldFailed.id, { status: EventOutboxStatus.Failed, updatedAt: daysAgo(31) });
    outboxEntryStore.patch(recentFailed.id, { status: EventOutboxStatus.Failed, updatedAt: daysAgo(2) });
    outboxEntryStore.patch(oldPending.id, { updatedAt: daysAgo(31) });

    // Action
    await eventDeliveryService.pruneTerminalRows();

    // Assert
    expect(outboxEntryStore.all().map((row) => row.id)).toEqual([freshDelivered.id, recentFailed.id, oldPending.id]);
  });
});

describe("EventDeliveryService.relayDueEvents", () => {
  // One flush per consumer at a time (the job id). Retries live on the entry, so BullMQ gets a single attempt.
  test("should enqueue one flush job per consumer with due work", async () => {
    // Setup
    const { eventEmitterService, eventDeliveryService, queue } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "audit" })]
    });
    await eventEmitterService.emit([makeEvent(), makeEvent()]);

    // Action
    await eventDeliveryService.relayDueEvents();

    // Assert
    expect(queue.jobs).toEqual([
      {
        queue: "event-outbox-flush",
        data: { consumer: "alert" },
        opts: { jobId: "outbox-flush-alert", removeOnComplete: true, removeOnFail: true, attempts: 1 }
      },
      {
        queue: "event-outbox-flush",
        data: { consumer: "audit" },
        opts: { jobId: "outbox-flush-audit", removeOnComplete: true, removeOnFail: true, attempts: 1 }
      }
    ]);
  });

  test("should enqueue nothing when no work is due", async () => {
    // Setup
    const { eventDeliveryService, queue } = await buildWithPending(deliverAll);
    await eventDeliveryService.drain("alert");

    // Action
    await eventDeliveryService.relayDueEvents();

    // Assert
    expect(queue.jobs).toEqual([]);
  });

  test("should report how long the oldest undelivered event has waited when telemetry is on", async () => {
    // Setup
    const { eventEmitterService, eventDeliveryService, metrics } = buildEvents({
      consumers: [makeConsumer()],
      isTelemetryEnabled: true
    });
    await eventEmitterService.emit([makeEvent({ time: new Date(Date.now() - 90_000) }), makeEvent()]);

    // Action
    await eventDeliveryService.relayDueEvents();

    // Assert
    const [age] = metrics.oldestPending;
    expect(age.consumer).toBe("alert");
    expect(age.ageSeconds).toBeGreaterThanOrEqual(90);
  });

  test("should not measure the backlog when telemetry is off", async () => {
    // Setup
    const { eventDeliveryService, metrics } = await buildWithPending(deliverAll);

    // Action
    await eventDeliveryService.relayDueEvents();

    // Assert
    expect(metrics.oldestPending).toEqual([]);
  });
});
