import crypto from "node:crypto";

import { z } from "zod";

import { TEventInput } from "../../models/emitted-event";
import { EventOutboxStatus } from "../../models/outbox-entry";
import { buildEvents } from "../../testing/build-events";
import { TEventConsumer } from "../dependencies";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const EVENT_TYPE = "approval.workflow.request_opened";

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

const makeConsumer = (overrides?: Partial<TEventConsumer>): TEventConsumer => ({
  name: "alert",
  dataSchema: z.object({ targetIds: z.array(z.string()).min(1) }),
  subscribesTo: (type: string) => type === EVENT_TYPE,
  handle: async () => [],
  ...overrides
});

describe("EventEmitterService.emit", () => {
  test("should write one entry per subscribing consumer and none for a non-subscriber", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "other", subscribesTo: () => false })]
    });

    // Action
    await eventEmitterService.emit([makeEvent()]);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.consumer)).toEqual(["alert"]);
  });

  test("should give every consumer's entry for one event the event's id", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ name: "alert" }), makeConsumer({ name: "other" })]
    });
    const event = makeEvent();

    // Action
    await eventEmitterService.emit([event]);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual([event.id, event.id]);
  });

  test("should write many events in the order they were given", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });
    const events = [makeEvent(), makeEvent(), makeEvent()];

    // Action
    await eventEmitterService.emit(events);

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual(events.map((event) => event.id));
    expect(outboxEntryStore.all().every((row) => row.status === EventOutboxStatus.Pending)).toBe(true);
  });

  test("should not touch the store when no consumer handles the event type", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({
      consumers: [makeConsumer({ subscribesTo: () => false })]
    });
    outboxEntryStore.insert = async () => {
      throw new Error("the store was reached");
    };

    // Action
    const result = eventEmitterService.emit([makeEvent()]);

    // Assert
    await expect(result).resolves.toBeUndefined();
  });

  // A write that commits without its event is a change consumers never hear about, so a bad event fails it.
  test("should refuse an event whose data does not match a consumer's schema", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore, metrics } = buildEvents({
      consumers: [makeConsumer({ name: "lenient", dataSchema: z.object({}) }), makeConsumer({ name: "alert" })]
    });

    // Action
    const result = eventEmitterService.emit([makeEvent({ data: makePayload({ targetIds: [] }) })]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(metrics.rejected).toEqual([{ eventType: EVENT_TYPE, reason: "data_rejected", consumer: "alert" }]);
  });

  test("should refuse an event whose data is oversized", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore, metrics } = buildEvents({
      consumers: [makeConsumer({ dataSchema: z.object({ blob: z.string() }) })]
    });

    // Action
    const result = eventEmitterService.emit([makeEvent({ data: { blob: "x".repeat(16 * 1024 + 1) } })]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(metrics.rejected).toEqual([{ eventType: EVENT_TYPE, reason: "data_too_large" }]);
  });

  test.each([
    ["the id is not a UUID", { id: "reminder-1" }, EVENT_TYPE],
    ["the type is not a dot-namespaced key", { type: "Not A Key" }, "Not A Key"]
  ])("should refuse an event when %s", async (_, override, reportedType) => {
    // Setup
    const { eventEmitterService, outboxEntryStore, metrics } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = eventEmitterService.emit([makeEvent(override)]);

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
    expect(metrics.rejected).toEqual([{ eventType: reportedType, reason: "invalid_event" }]);
  });

  test("should write none of the events when one of them is refused", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = eventEmitterService.emit([makeEvent(), makeEvent({ type: "Not A Key" })]);

    // Assert
    await expect(result).rejects.toThrow();
    expect(outboxEntryStore.all()).toEqual([]);
  });

  // Swallowing it would hand the caller a poisoned transaction instead of the real error.
  test("should let a failing insert reach the caller", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore } = buildEvents({ consumers: [makeConsumer()] });
    outboxEntryStore.insert = async () => {
      throw new Error("connection terminated");
    };

    // Action
    const result = eventEmitterService.emit([makeEvent()]);

    // Assert
    await expect(result).rejects.toThrow("connection terminated");
  });
});

describe("EventEmitterService.within", () => {
  test("should keep the events when the caller's transaction commits", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });
    const event = makeEvent();

    // Action
    await transactionRunner.run(({ tx }) => eventEmitterService.within(tx).emit([event]));

    // Assert
    expect(outboxEntryStore.all().map((row) => row.eventId)).toEqual([event.id]);
  });

  test("should drop the events when the caller's transaction rolls back", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = transactionRunner.run(async ({ tx }) => {
      await eventEmitterService.within(tx).emit([makeEvent()]);
      throw new Error("the business write failed");
    });

    // Assert
    await expect(result).rejects.toThrow("the business write failed");
    expect(outboxEntryStore.all()).toEqual([]);
  });

  test("should refuse a malformed event, failing the caller's transaction", async () => {
    // Setup
    const { eventEmitterService, outboxEntryStore, transactionRunner } = buildEvents({ consumers: [makeConsumer()] });

    // Action
    const result = transactionRunner.run(({ tx }) => eventEmitterService.within(tx).emit([makeEvent({ id: "nope" })]));

    // Assert
    await expect(result).rejects.toThrow("could not record an event for this change");
    expect(outboxEntryStore.all()).toEqual([]);
  });
});
