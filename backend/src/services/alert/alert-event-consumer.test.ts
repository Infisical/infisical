import { AlertDispatchOutcome } from "@app/lib/telemetry/metrics";
import { EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";

import { alertEventConsumerFactory } from "./alert-event-consumer";
import { AlertTriggerType } from "./alert-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_TYPE = "approval.workflow.request_opened";

const makeAlert = (id: string) => ({ id, resourceType: "approval.workflow", orgId: ORG_ID }) as never;

const makePayload = (overrides?: Record<string, unknown>) => ({
  resourceType: "approval.workflow",
  resourceId: "policy-1",
  targetIds: ["req-1"],
  ...overrides
});

const makeEvent = (overrides?: Partial<TEvent>): TEvent =>
  ({
    id: 1,
    eventType: EVENT_TYPE,
    orgId: ORG_ID,
    projectId: null,
    payload: makePayload(),
    occurredAt: new Date(),
    progress: null,
    ...overrides
  }) as TEvent;

const buildConsumer = (opts?: {
  alerts?: unknown[];
  results?: { outcome: AlertDispatchOutcome; deliveredChannelIds: string[] }[];
  eventKeys?: string[];
  findAlerts?: () => Promise<unknown[]>;
}) => {
  const runs: {
    alertId: string;
    targetIds: string[];
    payload?: Record<string, unknown>;
    skipChannelIds?: string[];
  }[] = [];
  const results = opts?.results ?? [{ outcome: AlertDispatchOutcome.DeliverySuccess, deliveredChannelIds: ["c-1"] }];
  let runIdx = 0;
  let lookups = 0;
  const eventKeys = opts?.eventKeys ?? [EVENT_TYPE];
  const consumer = alertEventConsumerFactory({
    alertDAL: {
      findEnabledForEvent: async () => {
        lookups += 1;
        if (opts?.findAlerts) return (await opts.findAlerts()) as never;
        return (opts?.alerts ?? [makeAlert("alert-1")]) as never;
      }
    },
    alertEngine: {
      runAlertForEvent: async (
        alert: { id: string },
        input: { targetIds: string[]; payload: Record<string, unknown>; skipChannelIds?: string[] }
      ) => {
        runs.push({
          alertId: alert.id,
          targetIds: input.targetIds,
          payload: input.payload,
          skipChannelIds: input.skipChannelIds
        });
        const result = results[Math.min(runIdx, results.length - 1)];
        runIdx += 1;
        return result;
      }
    } as never,
    alertProviderRegistry: {
      eventTriggeredKeys: () => new Set(eventKeys),
      get: (resourceType: string) =>
        resourceType === "approval.workflow"
          ? ({ events: eventKeys.map((key) => ({ key, triggerType: AlertTriggerType.Event })) } as never)
          : undefined
    }
  });

  return { consumer, runs, getLookups: () => lookups };
};

describe("alert event consumer", () => {
  test("subscribes only to event keys a registered provider declares as event-triggered", () => {
    const { consumer } = buildConsumer();

    expect(consumer.subscribesTo(EVENT_TYPE)).toBe(true);
    expect(consumer.subscribesTo("identity.authentication.expiry")).toBe(false);
  });

  test("delivers the event's targets and marks it delivered", async () => {
    const { consumer, runs } = buildConsumer();

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(runs[0].targetIds).toEqual(["req-1"]);
    // The provider sees everything the emitter wrote, not only the ids the consumer validated.
    expect(runs[0].payload).toEqual(makePayload());
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1"] });
  });

  // The alert was deleted or disabled between the gate and the worker, so nobody is owed a
  // notification. That's a completed event, not something to retry forever.
  test("marks the event delivered when no alert matches any more", async () => {
    const { consumer, runs } = buildConsumer({ alerts: [] });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(runs).toHaveLength(0);
  });

  test("retries and records what already delivered when a channel fails", async () => {
    const { consumer } = buildConsumer({
      results: [{ outcome: AlertDispatchOutcome.DeliveryPartial, deliveredChannelIds: ["c-1"] }]
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(result.status).toBe(EventResultStatus.Retry);
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1"] });
  });

  test("skips the channels a previous attempt already delivered to", async () => {
    const { consumer, runs } = buildConsumer();

    await consumer.handle([makeEvent({ progress: { deliveredChannelIds: ["c-1"] } })]);

    expect(runs[0].skipChannelIds).toEqual(["c-1"]);
  });

  // Retrying can't fix a payload the consumer can't read, so don't burn every attempt on it first.
  test("fails terminally on an unreadable payload", async () => {
    const { consumer } = buildConsumer();

    const [result] = await consumer.handle([makeEvent({ payload: makePayload({ targetIds: [] }) })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("Unreadable alert event payload");
  });

  test("runs every matching alert in a scope", async () => {
    const { consumer, runs } = buildConsumer({
      alerts: [makeAlert("alert-project"), makeAlert("alert-org")],
      results: [
        { outcome: AlertDispatchOutcome.DeliverySuccess, deliveredChannelIds: ["c-1"] },
        { outcome: AlertDispatchOutcome.DeliverySuccess, deliveredChannelIds: ["c-2"] }
      ]
    });

    const [result] = await consumer.handle([makeEvent()]);

    expect(runs.map((run) => run.alertId)).toEqual(["alert-project", "alert-org"]);
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1", "c-2"] });
  });

  // Marking a mismatched pair delivered would hide the misconfigured emit site. Failing terminally
  // with both halves named is what surfaces it.
  test("fails terminally when no provider declares the event for that resource type", async () => {
    const { consumer, runs, getLookups } = buildConsumer();

    const [result] = await consumer.handle([makeEvent({ payload: makePayload({ resourceType: "pki.certificate" }) })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("pki.certificate");
    expect(result.error).toContain("approval.workflow.request_opened");
    expect(runs).toHaveLength(0);
    expect(getLookups()).toBe(0);
  });

  // Throwing out of handle() sends the whole batch back for retry, re-notifying on events that already
  // delivered, so one event's failure has to stay that event's failure.
  test("retries only the event whose lookup threw", async () => {
    let calls = 0;
    const { consumer, runs } = buildConsumer({
      eventKeys: [EVENT_TYPE, "approval.workflow.request_closed", "approval.workflow.request_reopened"],
      findAlerts: async () => {
        calls += 1;
        if (calls === 2) throw new Error("connection reset");
        return [makeAlert(`alert-${calls}`)];
      }
    });

    const results = await consumer.handle([
      makeEvent({ id: 1, eventType: EVENT_TYPE }),
      makeEvent({ id: 2, eventType: "approval.workflow.request_closed" }),
      makeEvent({ id: 3, eventType: "approval.workflow.request_reopened" })
    ]);

    expect(results.map((result) => result.status)).toEqual([
      EventResultStatus.Delivered,
      EventResultStatus.Retry,
      EventResultStatus.Delivered
    ]);
    expect(results[1].error).toBe("connection reset");
    expect(runs.map((run) => run.alertId)).toEqual(["alert-1", "alert-3"]);
  });

  test("resolves the matching alerts once per event type within a batch", async () => {
    const { consumer, getLookups } = buildConsumer();

    await consumer.handle([
      makeEvent({ id: 1, payload: makePayload({ targetIds: ["req-1"] }) }),
      makeEvent({ id: 2, payload: makePayload({ targetIds: ["req-2"] }) }),
      makeEvent({ id: 3, payload: makePayload({ targetIds: ["req-3"] }) })
    ]);

    expect(getLookups()).toBe(1);
  });

  // Events arrive in id order. Handling them concurrently would fan a whole batch of notifications out
  // at once and deliver events for one resource out of order.
  test("handles events serially, in the order given", async () => {
    const { consumer, runs } = buildConsumer();

    const results = await consumer.handle([
      makeEvent({ id: 1, payload: makePayload({ targetIds: ["req-1"] }) }),
      makeEvent({ id: 2, payload: makePayload({ targetIds: ["req-2"] }) })
    ]);

    expect(results.map((result) => result.id)).toEqual(["1", "2"]);
    expect(runs.map((run) => run.targetIds)).toEqual([["req-1"], ["req-2"]]);
  });
});
