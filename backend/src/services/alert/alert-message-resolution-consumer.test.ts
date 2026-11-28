import { EventResultStatus, TEvent } from "@app/domains/platform/events/ce/module";

import { alertMessageResolutionConsumerFactory } from "./alert-message-resolution-consumer";

const ORG_ID = "6f1f6f9e-4a4b-4a4b-8a8a-1f1f1f1f1f1f";
const CLOSING_EVENT = "pam.folder.access-request-approved";

const event = (overrides: Partial<TEvent> = {}): TEvent => ({
  specversion: "1.0",
  id: "event-1",
  source: "test",
  type: CLOSING_EVENT,
  time: "2026-11-27T19:13:00.000Z",
  data: {
    orgId: ORG_ID,
    projectId: "project-1",
    resourceType: "pam.folder",
    resourceId: "folder-1",
    targetIds: ["request-1"]
  },
  isFinalAttempt: false,
  ...overrides
});

const setup = (errors: string[] = []) => {
  const resolveMessages = vi.fn(async () => errors);
  const consumer = alertMessageResolutionConsumerFactory({
    alertProviderRegistry: { messageClosingKeys: () => new Set([CLOSING_EVENT]) },
    alertMessageResolution: { resolveMessages }
  });
  return { consumer, resolveMessages };
};

describe("alertMessageResolutionConsumer", () => {
  test("subscribes only to the providers' closing events", () => {
    const { consumer } = setup();
    expect(consumer.subscribesTo(CLOSING_EVENT)).toBe(true);
    expect(consumer.subscribesTo("pam.folder.access-requested")).toBe(false);
  });

  test("updates the event's targets and reports delivery", async () => {
    const { consumer, resolveMessages } = setup();

    const [result] = await consumer.handle([event()]);

    expect(result.status).toBe(EventResultStatus.Delivered);
    expect(resolveMessages).toHaveBeenCalledWith({
      orgId: ORG_ID,
      projectId: "project-1",
      resourceType: "pam.folder",
      targetIds: ["request-1"]
    });
  });

  test("retries when a Slack edit failed for a transient reason", async () => {
    const { consumer } = setup(["C0123ABCD/1.1: ratelimited"]);

    const [result] = await consumer.handle([event()]);

    expect(result).toMatchObject({ status: EventResultStatus.Retry, error: "C0123ABCD/1.1: ratelimited" });
  });

  test("fails on the last attempt instead of retrying", async () => {
    const { consumer } = setup(["C0123ABCD/1.1: ratelimited"]);

    const [result] = await consumer.handle([event({ isFinalAttempt: true })]);

    expect(result.status).toBe(EventResultStatus.Failed);
  });

  test("fails an event it can't read", async () => {
    const { consumer, resolveMessages } = setup();

    const [result] = await consumer.handle([event({ data: { orgId: "not-a-uuid" } })]);

    expect(result.status).toBe(EventResultStatus.Failed);
    expect(resolveMessages).not.toHaveBeenCalled();
  });
});
