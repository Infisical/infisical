import crypto from "node:crypto";

import { OutboxClaim } from "./outbox-claim";
import { EventOutboxStatus, EventResultStatus, OutboxEntry } from "./outbox-entry";

const makeEntry = () =>
  OutboxEntry.restore({
    id: crypto.randomUUID(),
    consumer: "alert",
    eventId: crypto.randomUUID(),
    eventType: "approval.workflow.request_opened",
    payload: {},
    occurredAt: new Date(),
    status: EventOutboxStatus.Processing,
    attempts: 0,
    lastError: null
  });

describe("OutboxClaim.settle", () => {
  test("should give each entry the result reported for its event", () => {
    // Setup
    const [delivered, failed] = [makeEntry(), makeEntry()];
    const claim = OutboxClaim.restore({ lockToken: "token", entries: [delivered, failed] });

    // Action
    claim.settle([
      { id: failed.eventId, status: EventResultStatus.Failed, error: "bad payload" },
      { id: delivered.eventId, status: EventResultStatus.Delivered }
    ]);

    // Assert
    expect(delivered.status).toBe(EventOutboxStatus.Delivered);
    expect(failed).toMatchObject({ status: EventOutboxStatus.Failed, lastError: "bad payload" });
  });

  test("should retry an entry no result was reported for", () => {
    // Setup
    const [reported, missing] = [makeEntry(), makeEntry()];
    const claim = OutboxClaim.restore({ lockToken: "token", entries: [reported, missing] });

    // Action
    claim.settle([{ id: reported.eventId, status: EventResultStatus.Delivered }]);

    // Assert
    expect(missing).toMatchObject({ status: EventOutboxStatus.Retry, attempts: 1 });
    expect(missing.lastError).toContain("no result");
  });
});
