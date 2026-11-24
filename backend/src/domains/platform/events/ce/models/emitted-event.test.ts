import crypto from "node:crypto";

import { EmittedEvent, MAX_OUTBOX_PAYLOAD_BYTES, TEventInput } from "./emitted-event";
import { EventRejectedError, EventRejectionReason } from "./event-rejection";

const makeInput = (overrides?: Partial<TEventInput>): TEventInput => ({
  id: crypto.randomUUID(),
  type: "approval.workflow.request_opened",
  data: { orgId: "org-1" },
  ...overrides
});

const rejection = (input: TEventInput) => {
  try {
    EmittedEvent.create(input);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe("EmittedEvent.create", () => {
  test("should keep the id, type and data, and take the given time as when it occurred", () => {
    // Setup
    const time = new Date("2026-08-20T17:42:31.000Z");
    const input = makeInput({ time });

    // Action
    const event = EmittedEvent.create(input);

    // Assert
    expect(event).toMatchObject({ id: input.id, type: input.type, data: input.data, occurredAt: time });
  });

  test("should say the event occurred now when no time is given", () => {
    // Setup
    const before = Date.now();

    // Action
    const event = EmittedEvent.create(makeInput());

    // Assert
    expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  test.each([
    ["the id is not a UUID", { id: "reminder-1" }, "approval.workflow.request_opened"],
    ["the type is not a dot-namespaced key", { type: "Not A Key" }, "Not A Key"]
  ])("should refuse an event when %s", (_, override, reportedType) => {
    // Action
    const error = rejection(makeInput(override));

    // Assert
    expect(error).toBeInstanceOf(EventRejectedError);
    expect(error).toMatchObject({ reason: EventRejectionReason.InvalidEvent, eventType: reportedType });
  });

  test("should refuse data over the size limit", () => {
    // Setup
    const input = makeInput({ data: { blob: "x".repeat(MAX_OUTBOX_PAYLOAD_BYTES + 1) } });

    // Action
    const error = rejection(input);

    // Assert
    expect(error).toMatchObject({ reason: EventRejectionReason.DataTooLarge, eventType: input.type });
  });
});
