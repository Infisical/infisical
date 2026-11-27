import { ChatPostFailure, WorkflowIntegration } from "@app/domains/platform/workflow-integrations/ce/module";
import { FakeChatDeliveryService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-chat-delivery-service";
import { FakeWorkflowIntegrationService } from "@app/domains/platform/workflow-integrations/ce/testing/fake-workflow-integration-service";
import {
  microsoftTeamsIntegration,
  slackIntegration
} from "@app/domains/platform/workflow-integrations/ce/testing/workflow-integration-fixture";

import { SlackAppChannelConfigSchema, TAlertChannelDeps, TAlertPayload } from "../alert-channel-types";
import { assertSlackAppConfigInScope, sendSlackAppNotification } from "./alert-channel-slack-app-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const ORG_ID = "6f1f6f9e-4a4b-4a4b-8a8a-1f1f1f1f1f1f";
const INTEGRATION_ID = "0b9a9d3e-1c1c-4c4c-9d9d-2e2e2e2e2e2e";

const payload = (): TAlertPayload => ({
  alert: {
    id: "alert-1",
    name: "prod-cert-expiry",
    orgId: ORG_ID,
    resourceType: "cert-manager",
    viewUrl: "https://app.infisical.com/alerts"
  },
  eventKey: "cert-manager.certificate.expiry",
  eventLabel: "Expiry",
  webhookType: "com.infisical.cert-manager.certificate.expiry",
  resourceKind: "Certificate",
  resourceOwnerKind: "Certificate Manager",
  severity: "warning",
  summary: "1 certificate expiring within 30d",
  items: [{ id: "cert-a", title: "api.example.com" }]
});

const config = {
  workflowIntegrationId: INTEGRATION_ID,
  channels: [
    { id: "C0123ABCD", name: "team-payments" },
    { id: "C0456EFGH", name: "security" }
  ]
};

const withId = (integration: WorkflowIntegration) =>
  WorkflowIntegration.restore({ ...integration.toJSON(), id: INTEGRATION_ID });

const buildDeps = (integration: WorkflowIntegration | null = withId(slackIntegration({ orgId: ORG_ID }))) => {
  const workflowIntegrationService = new FakeWorkflowIntegrationService();
  if (integration) workflowIntegrationService.add(integration);
  const chatDeliveryService = new FakeChatDeliveryService();
  if (!integration) chatDeliveryService.markMissing(INTEGRATION_ID);
  const deps = {
    smtpService: { sendMail: async () => undefined },
    workflowIntegrationService,
    chatDeliveryService
  } as unknown as TAlertChannelDeps;
  return { deps, chatDeliveryService };
};

const send = (setup = buildDeps()) =>
  sendSlackAppNotification({
    channelId: "chan-1",
    config,
    payload: payload(),
    deps: setup.deps
  });

describe("SlackAppChannelConfigSchema", () => {
  test("accepts an integration with channels", () => {
    expect(SlackAppChannelConfigSchema.safeParse(config).success).toBe(true);
  });

  test("requires at least one channel", () => {
    expect(SlackAppChannelConfigSchema.safeParse({ ...config, channels: [] }).success).toBe(false);
  });

  test("rejects the same channel twice", () => {
    const result = SlackAppChannelConfigSchema.safeParse({
      ...config,
      channels: [config.channels[0], config.channels[0]]
    });
    expect(result.success).toBe(false);
  });

  test("rejects a user or DM ID so a channel can't message a person", () => {
    ["U0123ABCD", "D0123ABCD"].forEach((id) => {
      expect(SlackAppChannelConfigSchema.safeParse({ ...config, channels: [{ id, name: "x" }] }).success).toBe(false);
    });
  });

  test("rejects a channel ID that isn't a Slack ID", () => {
    const result = SlackAppChannelConfigSchema.safeParse({
      ...config,
      channels: [{ id: "<!channel>", name: "general" }]
    });
    expect(result.success).toBe(false);
  });
});

describe("assertSlackAppConfigInScope", () => {
  test("accepts an integration from the alert's org", async () => {
    await expect(assertSlackAppConfigInScope({ orgId: ORG_ID, config }, buildDeps().deps)).resolves.toBeUndefined();
  });

  test("rejects an integration from another org", async () => {
    await expect(
      assertSlackAppConfigInScope(
        { orgId: ORG_ID, config },
        buildDeps(withId(slackIntegration({ orgId: "other-org" }))).deps
      )
    ).rejects.toThrow(/not found in this organization/);
  });

  test("rejects a Microsoft Teams integration", async () => {
    await expect(
      assertSlackAppConfigInScope(
        { orgId: ORG_ID, config },
        buildDeps(withId(microsoftTeamsIntegration({ orgId: ORG_ID }))).deps
      )
    ).rejects.toThrow(/not found in this organization/);
  });
});

describe("sendSlackAppNotification", () => {
  test("posts the alert to every selected channel", async () => {
    const setup = buildDeps();

    await expect(send(setup)).resolves.toEqual({ success: true });

    expect(setup.chatDeliveryService.posts).toHaveLength(1);
    expect(setup.chatDeliveryService.posts[0].channelIds).toEqual(["C0123ABCD", "C0456EFGH"]);
    expect(JSON.stringify(setup.chatDeliveryService.posts[0].message)).toContain("prod-cert-expiry");
  });

  test("bounds the Slack client's retries and timeout", async () => {
    const setup = buildDeps();
    await send(setup);
    expect(setup.chatDeliveryService.posts[0].limits).toEqual({ timeoutMs: 7000, retries: 2 });
  });

  test("fails with a readable error when the integration was deleted", async () => {
    const setup = buildDeps(null);
    const result = await send(setup);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no longer exists/);
    expect(setup.chatDeliveryService.posts).toHaveLength(0);
  });

  test("tells the user to add the app when it isn't in the channel", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService
      .refuse("C0123ABCD", { failure: ChatPostFailure.NotInChannel })
      .refuse("C0456EFGH", { failure: ChatPostFailure.NotInChannel });
    const result = await send(setup);
    expect(result.success).toBe(false);
    expect(result.error).toContain("The Infisical app isn't in #team-payments");
  });

  test("points at reconnecting when the token was revoked", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService
      .refuse("C0123ABCD", { failure: ChatPostFailure.AuthRejected, providerError: "token_revoked" })
      .refuse("C0456EFGH", { failure: ChatPostFailure.AuthRejected, providerError: "token_revoked" });
    const result = await send(setup);
    expect(result.error).toContain("Reconnect the Slack integration");
  });

  test("counts a run as delivered when one channel received it, and reports the other", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService.refuse("C0123ABCD", { failure: ChatPostFailure.Archived });
    await expect(send(setup)).resolves.toEqual({ success: true, error: "#team-payments is archived." });
  });

  test("reports a revoked token once, not once per channel", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService
      .refuse("C0123ABCD", { failure: ChatPostFailure.AuthRejected })
      .refuse("C0456EFGH", { failure: ChatPostFailure.AuthRejected });
    const result = await send(setup);
    expect(result.error?.match(/Reconnect/g)).toHaveLength(1);
  });

  test("names a rate limit and an unreachable Slack", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService
      .refuse("C0123ABCD", { failure: ChatPostFailure.RateLimited })
      .refuse("C0456EFGH", { failure: ChatPostFailure.Unreachable });
    const result = await send(setup);
    expect(result.error).toContain("Slack rate limited the message to #team-payments");
    expect(result.error).toContain("Could not reach Slack to post to #security");
  });

  test("quotes Slack's own code for an error it has no wording for, and has a generic fallback without one", async () => {
    const setup = buildDeps();
    setup.chatDeliveryService
      .refuse("C0123ABCD", { failure: ChatPostFailure.Other, providerError: "restricted_action" })
      .refuse("C0456EFGH", { failure: ChatPostFailure.Other });
    const result = await send(setup);
    expect(result.error).toBe(
      "Slack refused the message to #team-payments (restricted_action). Failed to post to #security."
    );
  });
});
