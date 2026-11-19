import crypto from "node:crypto";

import { z } from "zod";

import { TEventInput } from "../../models/emitted-event";
import { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS, OutboxEntry } from "../../models/outbox-entry";
import { buildEvents } from "../../testing/build-events";
import { IEventConsumer, TEvent } from "../dependencies";

const { loggerWarn } = vi.hoisted(() => ({ loggerWarn: vi.fn<(...args: unknown[]) => void>() }));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: loggerWarn, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const { exhaustedMetrics, rejectedMetrics } = vi.hoisted(() => ({
  exhaustedMetrics: [] as { consumer: string; count: number }[],
  rejectedMetrics: [] as { eventType: string; reason: string; consumer?: string }[]
}));
vi.mock("@app/lib/telemetry/metrics", () => ({
  EventOutboxRejectReason: {
    InvalidEvent: "invalid_event",
    DataTooLarge: "data_too_large",
    DataRejected: "data_rejected"
  },
  recordEventOutboxLagMetric: () => {},
  recordEventOutboxExhaustedMetric: (params: { consumer: string; count: number }) => {
    exhaustedMetrics.push(params);
  },
  recordEventOutboxRejectedMetric: (params: { eventType: string; reason: string; consumer?: string }) => {
    rejectedMetrics.push(params);
  }
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

const deliverAll: IEventConsumer["handle"] = async (events) =>
  events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered }));

const makeConsumer = (overrides?: Partial<IEventConsumer>): IEventConsumer => ({
  name: "alert",
  dataSchema: z.object({ targetIds: z.array(z.string()).min(1) }),
  subscribesTo: (type: string) => type === EVENT_TYPE,
  handle: deliverAll,
  ...overrides
});

// One consumer named "alert" with `count` events waiting for it.
const buildWithPending = async (handle: IEventConsumer["handle"], count = 1) => {
  const built = buildEvents({ consumers: [makeConsumer({ handle })] });
  await built.eventsService.emit(Array.from({ length: count }, () => makeEvent()));
  return built;
};

beforeEach(() => {
  loggerWarn.mockClear();
  exhaustedMetrics.length = 0;
  rejectedMetrics.length = 0;
});

describe("EventsService.emit", () => {
  test("should write one entry per subscribing consumer and none for a non-subscriber", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "other", subscribesTo: () => false })]
    });

    // Action
    await eventsService.emit([makeEvent()]);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.consumer)).toEqual(["alert"]);
  });

  test("should give every consumer's entry for one event the event's id", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "other" })]
    });
    const event = makeEvent();

    // Action
    await eventsService.emit([event]);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual([event.id, event.id]);
  });

  test("should write many events in the order they were given", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });
    const events = [makeEvent(), makeEvent(), makeEvent()];

    // Action
    await eventsService.emit(events);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual(events.map((event) => event.id));
    expect(outboxEntryStore.all().every((row) => row.status === EventOutboxStatus.Pending)).toBe(true);
  });

  test("should not touch the store when no consumer handles the event type", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ subscribesTo: () => false })]
    });
    outboxEntryStore.insert = async () => {
      throw new Error("the store was reached");
    };

    // Action
    const result = eventsService.emit([makeEvent()]);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  // A bad event fails the caller's write: a write that commits without its event is a change consumers
  // never hear about.
  test("should refuse an event whose data does not match a consumer's schema", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ name: "lenient", dataSchema: z.object({}) }), makeConsumer({ name: "alert" })]
    });

    // Action
    const result = eventsService.emit([makeEvent({ data: makePayload({ targetIds: [] }) })]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(rejectedMetrics).toEqual([{ eventType: EVENT_TYPE, reason: "data_rejected", consumer: "alert" }]);
  });

  test("should refuse an event whose data is oversized", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ dataSchema: z.object({ blob: z.string() }) })]
    });

    // Action
    const result = eventsService.emit([makeEvent({ data: { blob: "x".repeat(16 * 1024 + 1) } })]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(rejectedMetrics).toEqual([{ eventType: EVENT_TYPE, reason: "data_too_large", consumer: undefined }]);
  });

  test.each([
    ["the id is not a UUID", { id: "reminder-1" }, EVENT_TYPE],
    ["the type is not a dot-namespaced key", { type: "Not A Key" }, "Not A Key"]
  ])("should refuse an event when %s", async (_, override, reportedType) => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = eventsService.emit([makeEvent(override)]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(rejectedMetrics).toEqual([{ eventType: reportedType, reason: "invalid_event", consumer: undefined }]);
  });

  test("should write none of the events when one of them is refused", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = eventsService.emit([makeEvent(), makeEvent({ type: "Not A Key" })]);

    // Assert
    await expect(result).rejects.toThrow();
    expect(outboxEntryStore.all()).toEqual([]);
  });

  // Swallowing it would hand the caller a poisoned transaction instead of the real error.
  test("should let a failing insert reach the caller", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });
    outboxEntryStore.insert = async () => {
      throw new Error("connection terminated");
    };

    // Action
    const result = eventsService.emit([makeEvent()]);

    // Assert
    await expect(result).rejects.toThrow("connection terminated");
  });
});

describe("EventsService.within", () => {
  test("should keep the events when the caller's transaction commits", async () => {
    // Setup
    const { eventsService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });
    const event = makeEvent();

    // Action
    await transactionRunner.run(({ tx }) => eventsService.within(tx).emit([event]));

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual([event.id]);
  });

  test("should drop the events when the caller's transaction rolls back", async () => {
    // Setup
    const { eventsService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = transactionRunner.run(async ({ tx }) => {
      await eventsService.within(tx).emit([makeEvent()]);
      throw new Error("the business write failed");
    });

    // Assert
    await expect(result).rejects.toThrow("the business write failed");
    expect(outboxEntryStore.all()).toEqual([]);
  });

  test("should refuse a malformed event, failing the caller's transaction", async () => {
    // Setup
    const { eventsService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = transactionRunner.run(({ tx }) => eventsService.within(tx).emit([makeEvent({ id: "nope" })]));

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
  });
});

describe("EventsService.registerConsumer", () => {
  test("should refuse a second consumer under a name already taken", () => {
    // Setup
    const { eventsService } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const register = () => eventsService.registerConsumer(makeConsumer());

    // Assert
    expect(register).toThrow("already registered under the name 'alert'");
  });

  // A consumer added after the workers started would have missed every event emitted before it.
  test("should refuse a consumer once the registry is sealed", () => {
    // Setup
    const { eventsService, consumerRegistry } = buildEvents();
    consumerRegistry.seal();

    // Action
    const register = () => eventsService.registerConsumer(makeConsumer());

    // Assert
    expect(register).toThrow("was registered after the events module started");
  });
});

describe("EventsService.drain", () => {
  test("should deliver what is waiting and stop when nothing is left", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await buildWithPending(deliverAll, 2);

    // Action
    const result = await eventsService.drain("alert");

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
    const { eventsService } = buildEvents({
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
    await eventsService.emit([event]);

    // Action
    await eventsService.drain("alert");

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
    const { eventsService, outboxEntryStore } = await buildWithPending(async () => {
      throw new Error("provider exploded");
    }, 2);

    // Action
    await eventsService.drain("alert");

    // Assert
    expect(outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Retry, attempts: 1, lastError: "provider exploded" },
      { status: EventOutboxStatus.Retry, attempts: 1, lastError: "provider exploded" }
    ]);
  });

  test("should retry an entry the consumer returned no result for", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await buildWithPending(async () => []);

    // Action
    await eventsService.drain("alert");

    // Assert
    expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Retry, attempts: 1 }]);
  });

  test("should not hand an entry out again before its backoff has passed", async () => {
    // Setup
    const handle = vi.fn<IEventConsumer["handle"]>(async (events) =>
      events.map((event) => ({ id: event.id, status: EventResultStatus.Retry }))
    );
    const { eventsService } = await buildWithPending(handle);
    await eventsService.drain("alert");

    // Action
    const result = await eventsService.drain("alert");

    // Assert
    expect(result.handled).toBe(0);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  test("should tell the consumer about its last attempt, and fail the entry for good after it", async () => {
    // Setup
    const received: boolean[] = [];
    const { eventsService, outboxEntryStore } = await buildWithPending(async (events) => {
      received.push(...events.map((event) => event.isFinalAttempt));
      return events.map((event) => ({ id: event.id, status: EventResultStatus.Retry, error: "slack 502" }));
    }, 2);
    outboxEntryStore.patch(outboxEntryStore.all()[1].id, { attempts: MAX_OUTBOX_ATTEMPTS - 1 });

    // Action
    await eventsService.drain("alert");

    // Assert
    expect(received).toEqual([false, true]);
    expect(outboxEntryStore.all()).toMatchObject([
      { status: EventOutboxStatus.Retry, attempts: 1 },
      { status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS, lastError: "slack 502" }
    ]);
    expect(exhaustedMetrics).toEqual([{ consumer: "alert", count: 1 }]);
  });

  // A short settle means the sweeper handed the entries to another worker mid-delivery, so the batch went
  // out twice. This log is the only place that shows up.
  test("should report a claim that was taken away mid-delivery, leaving the new owner's entry alone", async () => {
    // Setup
    const built = buildEvents();
    built.eventsService.registerConsumer(
      makeConsumer({
        handle: async (events) => {
          built.outboxEntryStore.patch(built.outboxEntryStore.all()[0].id, { lockToken: "another-worker" });
          return deliverAll(events);
        }
      })
    );
    await built.eventsService.emit([makeEvent(), makeEvent()]);

    // Action
    await built.eventsService.drain("alert");

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
    const { eventsService } = await buildWithPending(deliverAll);

    // Action
    await eventsService.drain("alert");

    // Assert
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  test("should leave entries untouched when no consumer is registered under the name", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await buildWithPending(deliverAll);

    // Action
    const result = await eventsService.drain("gone");

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

    // A slow batch (slow webhook, many entries) has to keep its claim fresh or the sweeper hands it to a
    // second worker mid-delivery.
    test("should keep the claim fresh while the consumer is still handling a batch", async () => {
      // Setup
      let release: () => void = () => {};
      const { eventsService, outboxEntryStore } = await buildWithPending(
        (events) =>
          new Promise((resolve) => {
            release = () => resolve(events.map((event) => ({ id: event.id, status: EventResultStatus.Delivered })));
          })
      );
      const draining = eventsService.drain("alert");
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

    // Without this, a handle() that never settles keeps the heartbeat alive forever and, because the
    // flush job id is per consumer, blocks every later flush for that consumer until a restart.
    test("should give up on a consumer that never settles and retry the batch", async () => {
      // Setup
      const { eventsService, outboxEntryStore } = await buildWithPending(() => new Promise(() => {}), 2);

      // Action
      const draining = eventsService.drain("alert");
      await vi.advanceTimersByTimeAsync(30 * 60_000);

      // Assert
      await expect(draining).resolves.toEqual({ handled: 2, unknownConsumer: false });
      const rows = outboxEntryStore.all();
      expect(rows.map((row) => row.status)).toEqual([EventOutboxStatus.Retry, EventOutboxStatus.Retry]);
      expect(rows[0].lastError).toContain("did not finish handling the batch");
    });

    // The consumer already sent by now. Letting a transient failure escape would leave the entries to the
    // sweeper and notify again ten minutes later.
    test("should try again when saving the results fails once", async () => {
      // Setup
      const { eventsService, outboxEntryStore } = await buildWithPending(deliverAll);
      const save = outboxEntryStore.saveSettled.bind(outboxEntryStore);
      let saves = 0;
      outboxEntryStore.saveSettled = async (entries: OutboxEntry[], lockToken: string) => {
        saves += 1;
        if (saves === 1) throw new Error("connection reset");
        return save(entries, lockToken);
      };

      // Action
      const draining = eventsService.drain("alert");
      await vi.advanceTimersByTimeAsync(1_000);

      // Assert
      await expect(draining).resolves.toEqual({ handled: 1, unknownConsumer: false });
      expect(outboxEntryStore.all()).toMatchObject([{ status: EventOutboxStatus.Delivered }]);
    });

    test("should stop after three failed saves so the sweeper can take over", async () => {
      // Setup
      const { eventsService, outboxEntryStore } = await buildWithPending(deliverAll);
      let saves = 0;
      outboxEntryStore.saveSettled = async () => {
        saves += 1;
        throw new Error("connection reset");
      };

      // Action
      const draining = eventsService.drain("alert");
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

describe("EventsService.sweepStaleClaims", () => {
  const claimAll = async (count: number) => {
    const built = await buildWithPending(deliverAll, count);
    await built.outboxEntryStore.claimBatch("alert", count);
    return built;
  };

  test("should back off a stale claim, fail an exhausted one and leave a live one alone", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await claimAll(3);
    const [, stale, exhausted] = outboxEntryStore.all();
    const longAgo = new Date(Date.now() - HOUR_MS);
    outboxEntryStore.patch(stale.id, { lockedAt: longAgo });
    outboxEntryStore.patch(exhausted.id, { lockedAt: longAgo, attempts: MAX_OUTBOX_ATTEMPTS - 1 });

    // Action
    await eventsService.sweepStaleClaims();

    // Assert
    const [live, retried, failed] = outboxEntryStore.all();
    expect(live.status).toBe(EventOutboxStatus.Processing);
    expect(retried).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1, lockedAt: null, lockToken: null });
    expect(retried.nextRetryAt.getTime()).toBeGreaterThan(Date.now() + 20_000);
    expect(failed).toMatchObject({ status: EventOutboxStatus.Failed, attempts: MAX_OUTBOX_ATTEMPTS });
  });

  // An entry the sweeper gives up on is just as lost as one a consumer gives up on, and the exhausted
  // metric promises to count every one.
  test("should count the entries it gives up on, per consumer", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await claimAll(2);
    outboxEntryStore
      .all()
      .forEach((row) =>
        outboxEntryStore.patch(row.id, { lockedAt: new Date(Date.now() - HOUR_MS), attempts: MAX_OUTBOX_ATTEMPTS - 1 })
      );

    // Action
    await eventsService.sweepStaleClaims();

    // Assert
    expect(exhaustedMetrics).toEqual([{ consumer: "alert", count: 2 }]);
  });

  test("should record nothing when no claim is stale", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await claimAll(1);

    // Action
    await eventsService.sweepStaleClaims();

    // Assert
    expect(exhaustedMetrics).toEqual([]);
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
      const { eventsService, outboxEntryStore } = buildEvents();
      const limits: number[] = [];
      outboxEntryStore.lockStaleClaims = async ({ limit }) => {
        limits.push(limit);
        return Array.from({ length: batchSizes[limits.length - 1] ?? limit }, staleEntry);
      };
      return { eventsService, limits };
    };

    test("should keep sweeping while batches come back full, and stop at a bound", async () => {
      // Setup
      const { eventsService, limits } = buildSweep([]);

      // Action
      await eventsService.sweepStaleClaims();

      // Assert
      expect(limits).toEqual(Array.from({ length: 10 }, () => 1_000));
    });

    test("should stop after the first batch that comes back short", async () => {
      // Setup
      const { eventsService, limits } = buildSweep([1_000, 999, 1_000]);

      // Action
      await eventsService.sweepStaleClaims();

      // Assert
      expect(limits).toHaveLength(2);
    });
  });
});

describe("EventsService.pruneTerminalRows", () => {
  test("should delete delivered entries older than a day and failed ones older than thirty", async () => {
    // Setup
    const { eventsService, outboxEntryStore } = await buildWithPending(deliverAll, 5);
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * HOUR_MS);
    const [oldDelivered, freshDelivered, oldFailed, recentFailed, oldPending] = outboxEntryStore.all();
    outboxEntryStore.patch(oldDelivered.id, { status: EventOutboxStatus.Delivered, updatedAt: daysAgo(2) });
    outboxEntryStore.patch(freshDelivered.id, { status: EventOutboxStatus.Delivered });
    outboxEntryStore.patch(oldFailed.id, { status: EventOutboxStatus.Failed, updatedAt: daysAgo(31) });
    outboxEntryStore.patch(recentFailed.id, { status: EventOutboxStatus.Failed, updatedAt: daysAgo(2) });
    outboxEntryStore.patch(oldPending.id, { updatedAt: daysAgo(31) });

    // Action
    await eventsService.pruneTerminalRows();

    // Assert
    expect(outboxEntryStore.all().map((row) => row.id)).toEqual([freshDelivered.id, recentFailed.id, oldPending.id]);
  });
});

describe("EventsService.relayDueEvents", () => {
  // One flush per consumer at a time keeps drain's batches serial and dedupes a consumer the relay
  // rediscovers while its flush is still queued. Retry lives on the entry, where it survives a Redis
  // flush, so BullMQ gets a single attempt.
  test("should enqueue one flush job per consumer with due work", async () => {
    // Setup
    const { eventsService, queue } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "audit" })]
    });
    await eventsService.emit([makeEvent(), makeEvent()]);

    // Action
    await eventsService.relayDueEvents();

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
    const { eventsService, queue } = await buildWithPending(deliverAll);
    await eventsService.drain("alert");

    // Action
    await eventsService.relayDueEvents();

    // Assert
    expect(queue.jobs).toEqual([]);
  });

  test("should report how long the oldest undelivered event has waited when telemetry is on", async () => {
    // Setup
    const { eventsService } = buildEvents({ consumers: [makeConsumer()], isTelemetryEnabled: true });
    await eventsService.emit([makeEvent({ time: new Date(Date.now() - 90_000) }), makeEvent()]);

    // Action
    await eventsService.relayDueEvents();

    // Assert
    const [age] = eventsService.oldestPendingAges();
    expect(age.consumer).toBe("alert");
    expect(age.ageSeconds).toBeGreaterThanOrEqual(90);
  });

  test("should not measure the backlog when telemetry is off", async () => {
    // Setup
    const { eventsService } = await buildWithPending(deliverAll);

    // Action
    await eventsService.relayDueEvents();

    // Assert
    expect(eventsService.oldestPendingAges()).toEqual([]);
  });
});
