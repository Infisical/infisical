import { TSlackPayload } from "@app/lib/slack/slack-webhook";

import { alertMessageResolutionFactory } from "./alert-message-resolution-fns";
import { AlertMessageOutcome, TAlertMessageResolution } from "./alert-types";
import { SlackMessageUpdateResult, updateSlackAppMessage } from "./channels/alert-channel-slack-app-fns";
import { buildResolvedSlackPayload } from "./channels/alert-channel-slack-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

vi.mock("./channels/alert-channel-slack-app-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./channels/alert-channel-slack-app-fns")>()),
  updateSlackAppMessage: vi.fn()
}));

const ORG_ID = "6f1f6f9e-4a4b-4a4b-8a8a-1f1f1f1f1f1f";
const RESOLVED_AT = new Date("2026-11-27T19:13:00.000Z");

const original: TSlackPayload = {
  text: "PAM Access Request Alert: requests - Carol requested access",
  blocks: [{ type: "header", text: { type: "plain_text", text: "PAM Access Request Alert: requests" } }],
  attachments: [{ color: "#1f6feb", blocks: [{ type: "section", text: { type: "mrkdwn", text: "Carol requested" } }] }]
};

const approved: TAlertMessageResolution = {
  outcome: AlertMessageOutcome.Approved,
  resolvedAt: RESOLVED_AT,
  actorName: "Bernie",
  comment: "ok"
};

const storedMessage = (overrides: Record<string, unknown> = {}) => ({
  id: "msg-1",
  orgId: ORG_ID,
  workflowIntegrationId: "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e",
  slackChannelId: "C0123ABCD",
  messageTs: "1.1",
  resourceType: "pam.folder",
  targetId: "request-1",
  encryptedMessage: Buffer.from(JSON.stringify(original)),
  alertId: "alert-1",
  alertChannelId: "channel-1",
  alertEnabled: true,
  channelEnabled: true,
  membershipId: "membership-1",
  channelProjectId: "project-1",
  channelEncryptedConfig: Buffer.from(
    JSON.stringify({
      workflowIntegrationId: "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e",
      channels: [{ id: "C0123ABCD", name: "requests" }]
    })
  ),
  ...overrides
});

const setup = ({
  messages = [storedMessage()],
  resolutions = new Map([["request-1", approved]])
}: { messages?: ReturnType<typeof storedMessage>[]; resolutions?: Map<string, TAlertMessageResolution> } = {}) => {
  const resolveTargets = vi.fn(async () => resolutions);
  const deleteById = vi.fn(async () => ({}));
  const service = alertMessageResolutionFactory({
    alertProviderRegistry: {
      get: () => ({ messageResolver: { openingEvents: [], closingEvents: [], resolveTargets } }) as never
    },
    alertSlackMessageDAL: { findByTargets: vi.fn(async () => messages) as never, deleteById: deleteById as never },
    slackIntegrationDAL: { findByIdWithWorkflowIntegrationDetails: vi.fn() },
    kmsDataKeyService: {
      createCipherPairWithDataKey: vi.fn(async () => ({
        encryptor: vi.fn(),
        decryptor: ({ cipherTextBlob }: { cipherTextBlob: Buffer }) => cipherTextBlob
      }))
    } as never
  });
  const resolve = () =>
    service.resolveMessages({
      orgId: ORG_ID,
      projectId: "project-1",
      resourceType: "pam.folder",
      targetIds: ["request-1"]
    });
  return { resolve, resolveTargets, deleteById };
};

const updateMock = vi.mocked(updateSlackAppMessage);

describe("buildResolvedSlackPayload", () => {
  test("adds the outcome, who decided and when, and recolors the message", () => {
    const resolved = buildResolvedSlackPayload(original, {
      outcome: AlertMessageOutcome.Denied,
      resolvedAt: RESOLVED_AT,
      actorName: "Bernie <admin>",
      comment: "Not now"
    });

    expect(resolved.text).toBe(`❌ Denied: ${original.text}`);
    expect(resolved.blocks.slice(0, original.blocks.length)).toEqual(original.blocks);
    expect(resolved.blocks).toContainEqual({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*❌ Denied* by Bernie &lt;admin&gt; · <!date^1795806780^{date_short_pretty} at {time}|Fri, 27 Nov 2026 19:13:00 GMT>"
      }
    });
    expect(resolved.blocks).toContainEqual({
      type: "context",
      elements: [{ type: "plain_text", text: "Reviewer Comment: Not now" }]
    });
    expect(resolved.attachments?.[0]).toEqual({ ...original.attachments?.[0], color: "#da3633" });
  });

  test("keeps user text on one line without Slack formatting, so it can't pass for a decision", () => {
    const resolved = buildResolvedSlackPayload(original, {
      outcome: AlertMessageOutcome.BreakGlass,
      resolvedAt: RESOLVED_AT,
      actorName: "*Carol*\nTester",
      comment: "urgent fix\n*✅ Approved* by alice"
    });

    expect(JSON.stringify(resolved.blocks.at(-2))).toContain("by Carol Tester ·");
    expect(resolved.blocks.at(-1)).toEqual({
      type: "context",
      elements: [{ type: "plain_text", text: "Break-Glass Reason: urgent fix *✅ Approved* by alice" }]
    });
  });

  test("truncates a long comment", () => {
    const resolved = buildResolvedSlackPayload(original, { ...approved, comment: "x".repeat(5000) });

    const { text } = (resolved.blocks.at(-1) as { elements: { text: string }[] }).elements[0];
    expect(text.length).toBeLessThan(1100);
    expect(text.endsWith("…")).toBe(true);
  });

  test("shows a cancellation without an actor or comment", () => {
    const resolved = buildResolvedSlackPayload(original, {
      outcome: AlertMessageOutcome.Cancelled,
      resolvedAt: RESOLVED_AT,
      comment: "ignored"
    });

    expect(resolved.blocks).toHaveLength(original.blocks.length + 1);
    expect(JSON.stringify(resolved.blocks.at(-1))).toContain("*🚫 Cancelled* · ");
  });
});

describe("alertMessageResolution.resolveMessages", () => {
  beforeEach(() => {
    updateMock.mockReset();
  });

  test("edits each stored message of a closed target and forgets it", async () => {
    updateMock.mockResolvedValue({ result: SlackMessageUpdateResult.Updated });
    const { resolve, deleteById } = setup();

    await expect(resolve()).resolves.toEqual([]);
    expect(updateMock).toHaveBeenCalledWith(expect.anything(), {
      orgId: ORG_ID,
      workflowIntegrationId: "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e",
      slackChannelId: "C0123ABCD",
      messageTs: "1.1",
      message: buildResolvedSlackPayload(original, approved)
    });
    expect(deleteById).toHaveBeenCalledWith("msg-1");
  });

  test("skips the lookup when no message was stored", async () => {
    const { resolve, resolveTargets } = setup({ messages: [] });

    await expect(resolve()).resolves.toEqual([]);
    expect(resolveTargets).not.toHaveBeenCalled();
  });

  test("keeps the message of a target that is still open", async () => {
    const { resolve, deleteById } = setup({ resolutions: new Map() });

    await expect(resolve()).resolves.toEqual([]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteById).not.toHaveBeenCalled();
  });

  test("forgets a message Slack no longer has", async () => {
    updateMock.mockResolvedValue({ result: SlackMessageUpdateResult.Gone, error: "message_not_found" });
    const { resolve, deleteById } = setup();

    await expect(resolve()).resolves.toEqual([]);
    expect(deleteById).toHaveBeenCalledWith("msg-1");
  });

  test("keeps the message and reports the error when Slack fails for a transient reason", async () => {
    updateMock.mockResolvedValue({ result: SlackMessageUpdateResult.Retry, error: "ratelimited" });
    const { resolve, deleteById } = setup();

    await expect(resolve()).resolves.toEqual(["C0123ABCD/1.1: ratelimited"]);
    expect(deleteById).not.toHaveBeenCalled();
  });

  test.each([
    ["the alert is disabled", { alertEnabled: false }],
    ["the channel is disabled", { channelEnabled: false }],
    ["the channel was removed from the alert", { membershipId: null }],
    [
      "the Slack channel was removed from the alert channel",
      {
        channelEncryptedConfig: Buffer.from(
          JSON.stringify({
            workflowIntegrationId: "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e",
            channels: [{ id: "C0999ZZZZ", name: "other" }]
          })
        )
      }
    ],
    [
      "the alert channel now posts through another Slack integration",
      {
        channelEncryptedConfig: Buffer.from(
          JSON.stringify({
            workflowIntegrationId: "0b9a9d3e-1c1c-4c4c-9d9d-3f3f3f3f3f3f",
            channels: [{ id: "C0123ABCD", name: "requests" }]
          })
        )
      }
    ]
  ])("forgets the message without editing it when %s", async (_case, overrides) => {
    const { resolve, deleteById } = setup({ messages: [storedMessage(overrides)] });

    await expect(resolve()).resolves.toEqual([]);
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteById).toHaveBeenCalledWith("msg-1");
  });

  test("drops an unreadable message and still updates the others", async () => {
    updateMock.mockResolvedValue({ result: SlackMessageUpdateResult.Updated });
    const { resolve, deleteById } = setup({
      messages: [
        storedMessage({ id: "broken", encryptedMessage: Buffer.from("not json") }),
        storedMessage({ id: "msg-2", messageTs: "2.2" })
      ]
    });

    await expect(resolve()).resolves.toEqual([]);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(deleteById).toHaveBeenCalledWith("broken");
    expect(deleteById).toHaveBeenCalledWith("msg-2");
  });
});
