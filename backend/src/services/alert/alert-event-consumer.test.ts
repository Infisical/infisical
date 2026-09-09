import { AlertDispatchOutcome } from "@app/lib/telemetry/metrics";
import { EventOutboxStatus, TEventOutboxRow } from "@app/services/event-outbox/event-outbox-types";

import { alertEventConsumerFactory } from "./alert-event-consumer";
import { AlertTriggerType } from "./alert-types";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const ORG_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_TYPE = "approval.workflow.request_opened";

const makeAlert = (id: string) => ({ id, resourceType: "approval.workflow", orgId: ORG_ID }) as never;

const makeRow = (overrides?: Partial<TEventOutboxRow>): TEventOutboxRow =>
  ({
    id: 1,
    consumer: "alert",
    eventType: EVENT_TYPE,
    resourceType: "approval.workflow",
    resourceId: "policy-1",
    orgId: ORG_ID,
    projectId: null,
    payload: { targetIds: ["req-1"] },
    occurredAt: new Date(),
    status: EventOutboxStatus.Processing,
    attempts: 0,
    progress: null,
    ...overrides
  }) as TEventOutboxRow;

const buildConsumer = (opts?: {
  alerts?: unknown[];
  results?: { outcome: AlertDispatchOutcome; deliveredChannelIds: string[] }[];
  eventKeys?: string[];
  findAlerts?: () => Promise<unknown[]>;
}) => {
  const runs: { alertId: string; targetIds: string[]; skipChannelIds?: string[] }[] = [];
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
      runAlertForEvent: async (alert: { id: string }, input: { targetIds: string[]; skipChannelIds?: string[] }) => {
        runs.push({ alertId: alert.id, targetIds: input.targetIds, skipChannelIds: input.skipChannelIds });
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

describe("alert outbox consumer", () => {
  test("subscribes only to event keys a registered provider declares as event-triggered", () => {
    const { consumer } = buildConsumer();

    expect(consumer.subscribesTo(EVENT_TYPE)).toBe(true);
    expect(consumer.subscribesTo("identity.authentication.expiry")).toBe(false);
  });

  test("delivers the event's targets and marks the row delivered", async () => {
    const { consumer, runs } = buildConsumer();

    const [result] = await consumer.handle([makeRow()]);

    expect(result.status).toBe(EventOutboxStatus.Delivered);
    expect(runs[0].targetIds).toEqual(["req-1"]);
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1"] });
  });

  // The alert was deleted or disabled between the gate and the worker. Nothing owes anyone a
  // notification, so this is a completed event rather than something to retry forever.
  test("marks the row delivered when no alert matches any more", async () => {
    const { consumer, runs } = buildConsumer({ alerts: [] });

    const [result] = await consumer.handle([makeRow()]);

    expect(result.status).toBe(EventOutboxStatus.Delivered);
    expect(runs).toHaveLength(0);
  });

  test("retries and records what already delivered when a channel fails", async () => {
    const { consumer } = buildConsumer({
      results: [{ outcome: AlertDispatchOutcome.DeliveryPartial, deliveredChannelIds: ["c-1"] }]
    });

    const [result] = await consumer.handle([makeRow()]);

    expect(result.status).toBe(EventOutboxStatus.Retry);
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1"] });
  });

  test("skips the channels a previous attempt already delivered to", async () => {
    const { consumer, runs } = buildConsumer();

    await consumer.handle([makeRow({ progress: { deliveredChannelIds: ["c-1"] } })]);

    expect(runs[0].skipChannelIds).toEqual(["c-1"]);
  });

  // Retrying cannot fix a payload the consumer cannot read, so it fails terminally instead of burning
  // every attempt first.
  test("fails terminally on an unreadable payload", async () => {
    const { consumer } = buildConsumer();

    const [result] = await consumer.handle([makeRow({ payload: { targetIds: [] } })]);

    expect(result.status).toBe(EventOutboxStatus.Failed);
    expect(result.error).toMatch(/Unreadable alert event payload/);
  });

  test("runs every matching alert in a scope", async () => {
    const { consumer, runs } = buildConsumer({
      alerts: [makeAlert("alert-project"), makeAlert("alert-org")],
      results: [
        { outcome: AlertDispatchOutcome.DeliverySuccess, deliveredChannelIds: ["c-1"] },
        { outcome: AlertDispatchOutcome.DeliverySuccess, deliveredChannelIds: ["c-2"] }
      ]
    });

    const [result] = await consumer.handle([makeRow()]);

    expect(runs.map((run) => run.alertId)).toEqual(["alert-project", "alert-org"]);
    expect(result.progress).toEqual({ deliveredChannelIds: ["c-1", "c-2"] });
  });

  // subscribesTo only sees the event type, so an emitter that pairs a real event key with the wrong
  // resourceType gets through the gate. Silently marking that delivered would hide the misconfigured
  // emit site; failing terminally with both halves named is what surfaces it.
  test("fails terminally when no provider declares the event for that resource type", async () => {
    const { consumer, runs, getLookups } = buildConsumer();

    const [result] = await consumer.handle([makeRow({ resourceType: "pki.certificate" })]);

    expect(result.status).toBe(EventOutboxStatus.Failed);
    expect(result.error).toMatch(/pki\.certificate.*approval\.workflow\.request_opened/);
    expect(runs).toHaveLength(0);
    expect(getLookups()).toBe(0);
  });

  // Throwing out of handle() sends the whole batch back for retry, re-notifying on rows that had already
  // delivered. One row's failure has to stay that row's failure.
  test("retries only the row whose lookup threw", async () => {
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
      makeRow({ id: 1, eventType: EVENT_TYPE }),
      makeRow({ id: 2, eventType: "approval.workflow.request_closed" }),
      makeRow({ id: 3, eventType: "approval.workflow.request_reopened" })
    ]);

    expect(results.map((result) => result.status)).toEqual([
      EventOutboxStatus.Delivered,
      EventOutboxStatus.Retry,
      EventOutboxStatus.Delivered
    ]);
    expect(results[1].error).toBe("connection reset");
    expect(runs.map((run) => run.alertId)).toEqual(["alert-1", "alert-3"]);
  });

  test("resolves the matching alerts once per event type within a batch", async () => {
    const { consumer, getLookups } = buildConsumer();

    await consumer.handle([
      makeRow({ id: 1, payload: { targetIds: ["req-1"] } }),
      makeRow({ id: 2, payload: { targetIds: ["req-2"] } }),
      makeRow({ id: 3, payload: { targetIds: ["req-3"] } })
    ]);

    expect(getLookups()).toBe(1);
  });

  // Rows arrive in id order and share one resource, so handling them concurrently would deliver a
  // resource's events out of order.
  test("handles rows serially, in the order given", async () => {
    const { consumer, runs } = buildConsumer();

    const results = await consumer.handle([
      makeRow({ id: 1, payload: { targetIds: ["req-1"] } }),
      makeRow({ id: 2, payload: { targetIds: ["req-2"] } })
    ]);

    expect(results.map((result) => result.id)).toEqual(["1", "2"]);
    expect(runs.map((run) => run.targetIds)).toEqual([["req-1"], ["req-2"]]);
  });
});
