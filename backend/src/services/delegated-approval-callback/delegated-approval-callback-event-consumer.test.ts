import { describe, expect, test, vi } from "vitest";

import { EventResultStatus, TEvent } from "@app/services/event-outbox/event-outbox-types";

import { DELEGATED_APPROVAL_CALLBACK_EVENT_CONSUMER } from "./delegated-approval-callback-constants";
import { DelegatedApprovalCallbackEvent } from "./delegated-approval-callback-enums";
import { delegatedApprovalCallbackEventConsumerFactory } from "./delegated-approval-callback-event-consumer";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const makePayload = (overrides?: Record<string, unknown>) => ({
  delegatedRequestId: "11111111-1111-1111-1111-111111111111",
  approvalRequestId: "22222222-2222-2222-2222-222222222222",
  orgId: "33333333-3333-3333-3333-333333333333",
  event: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
  externalId: "9d41f2a7c3b24e1088f6a05e7b1d4c93",
  ...overrides
});

const makeEvent = (overrides?: Partial<TEvent>): TEvent =>
  ({
    id: 1,
    eventType: DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest,
    payload: makePayload(),
    occurredAt: new Date(),
    ...overrides
  }) as TEvent;

describe("delegatedApprovalCallbackEventConsumer", () => {
  const consumer = delegatedApprovalCallbackEventConsumerFactory();

  test("is registered under the callback consumer name", () => {
    expect(consumer.name).toBe(DELEGATED_APPROVAL_CALLBACK_EVENT_CONSUMER);
  });

  test("subscribes only to the callback events", () => {
    expect(consumer.subscribesTo(DelegatedApprovalCallbackEvent.SecretsManagementAccessRequest)).toBe(true);
    expect(consumer.subscribesTo("approval.workflow.request_opened")).toBe(false);
  });

  test("accepts a valid payload at emit", () => {
    expect(consumer.payloadSchema.safeParse(makePayload()).success).toBe(true);
    expect(consumer.payloadSchema.safeParse(makePayload({ orgId: "not-a-uuid" })).success).toBe(false);
  });

  test("marks a readable event delivered", async () => {
    const [result] = await consumer.handle([makeEvent()]);

    expect(result).toEqual({ id: "1", status: EventResultStatus.Delivered });
  });

  test("fails an unreadable payload instead of retrying it", async () => {
    const [result] = await consumer.handle([makeEvent({ payload: { delegatedRequestId: "nope" } })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(result.error).toContain("Unreadable");
  });

  test("returns one result per event", async () => {
    const results = await consumer.handle([makeEvent({ id: 1 }), makeEvent({ id: 2 } as never)]);

    expect(results.map((result) => result.id)).toEqual(["1", "2"]);
  });
});
