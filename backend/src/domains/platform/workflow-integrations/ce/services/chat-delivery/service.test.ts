import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

import { ChatMessage } from "../../models/chat-message";
import { ChatPostFailure } from "../../models/enums";
import { MicrosoftTeamsTokenKind } from "../../models/microsoft-teams-installation";
import { SlackInstallation } from "../../models/slack-installation";
import { buildWorkflowIntegrations, TEAMS_CREDENTIALS } from "../../testing/build-workflow-integrations";
import {
  microsoftTeamsIntegration,
  slackInstallation,
  slackIntegration
} from "../../testing/workflow-integration-fixture";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const NOW = new Date("2026-03-01T12:00:00.000Z");
const MINUTE = 60 * 1000;

const build = (options: Parameters<typeof buildWorkflowIntegrations>[0] = { microsoftTeams: TEAMS_CREDENTIALS }) =>
  buildWorkflowIntegrations({ now: () => NOW, ...options });

type TH = Awaited<ReturnType<typeof build>>;

const slackMessage = ChatMessage.slack({ text: "Secret expiring" });
const card = { type: "AdaptiveCard", body: [] };
const teamsMessage = ChatMessage.microsoftTeams({ adaptiveCard: card });

const seedSlack = async (h: TH, orgId: string, token: string) =>
  h.seed(
    slackIntegration({
      orgId,
      installation: SlackInstallation.restore({
        ...slackInstallation().toJSON(),
        encryptedBotAccessToken: await h.encryptForOrg(orgId, token)
      })
    })
  );

const seedTeams = async (h: TH, orgId: string, bot?: { value: string; expiresInMs: number }) => {
  const integration = microsoftTeamsIntegration({ orgId });
  integration.markInstalled();
  if (bot) {
    const cipher = await h.encryptForOrg(orgId, bot.value);
    integration.changeMicrosoftTeamsInstallation((teams) =>
      teams.withToken(MicrosoftTeamsTokenKind.BotFramework, cipher, new Date(NOW.getTime() + bot.expiresInMs))
    );
  }
  return h.seed(integration);
};

const initializeBot = (h: TH) =>
  h.microsoftTeamsBot.initialize({ appId: TEAMS_CREDENTIALS.appId, clientSecret: TEAMS_CREDENTIALS.clientSecret });

describe("ChatDeliveryService.post to Slack", () => {
  test("should post to every channel in order with the decrypted bot token and the message", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedSlack(h, orgId, "xoxb-secret");

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: slackMessage,
      channelIds: ["C1", "C2", "C3"]
    });

    // Assert
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        { channelId: "C1", delivered: true },
        { channelId: "C2", delivered: true },
        { channelId: "C3", delivered: true }
      ]
    });
    expect(h.slackClient.posted.map((post) => [post.channelId, post.botToken, post.message])).toEqual([
      ["C1", "xoxb-secret", { text: "Secret expiring" }],
      ["C2", "xoxb-secret", { text: "Secret expiring" }],
      ["C3", "xoxb-secret", { text: "Secret expiring" }]
    ]);
  });

  test("should report a refused channel with its failure and provider error while the others are delivered", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedSlack(h, orgId, "xoxb-secret");
    h.slackClient.refuse("C2", { failure: ChatPostFailure.NotInChannel, providerError: "not_in_channel" });

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: slackMessage,
      channelIds: ["C1", "C2", "C3"]
    });

    // Assert
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        { channelId: "C1", delivered: true },
        { channelId: "C2", delivered: false, failure: ChatPostFailure.NotInChannel, providerError: "not_in_channel" },
        { channelId: "C3", delivered: true }
      ]
    });
    expect(h.slackClient.posted.map((post) => post.channelId)).toEqual(["C1", "C2", "C3"]);
  });

  test("should pass the limits through to Slack", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedSlack(h, orgId, "xoxb-secret");

    // Action
    await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: slackMessage,
      channelIds: ["C1"],
      limits: { timeoutMs: 2000, retries: 1 }
    });

    // Assert
    expect(h.slackClient.posted.map((post) => post.limits)).toEqual([{ timeoutMs: 2000, retries: 1 }]);
  });

  test("should report another org's integration as missing and post nothing", async () => {
    // Setup
    const h = await build();
    const integration = await seedSlack(h, randomUUID(), "xoxb-theirs");

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId: randomUUID(),
      integrationId: integration.id,
      message: slackMessage,
      channelIds: ["C1"]
    });

    // Assert
    expect(result).toEqual({ integrationMissing: true });
    expect(h.slackClient.posted).toEqual([]);
  });

  test("should report an unknown integration as missing and post nothing", async () => {
    // Setup
    const h = await build();

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId: randomUUID(),
      integrationId: randomUUID(),
      message: slackMessage,
      channelIds: ["C1"]
    });

    // Assert
    expect(result).toEqual({ integrationMissing: true });
    expect(h.slackClient.posted).toEqual([]);
  });

  test("should refuse a Microsoft Teams message for a Slack integration and post nothing", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedSlack(h, orgId, "xoxb-secret");

    // Action
    const result = h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["C1"],
      teamId: "team-1"
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("is a Slack integration, not a Microsoft Teams integration");
    expect([h.slackClient.posted, h.microsoftTeamsClient.sent]).toEqual([[], []]);
  });
});

describe("ChatDeliveryService.post to Microsoft Teams", () => {
  test("should send the card to each channel with a bot token", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);
    const { tenantId } = integration.microsoftTeamsInstallation();

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1", "ch-2"],
      teamId: "team-1"
    });

    // Assert
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        { channelId: "ch-1", delivered: true },
        { channelId: "ch-2", delivered: true }
      ]
    });
    expect(h.microsoftTeamsClient.sent).toEqual([
      { botToken: `bot-framework-token-${tenantId}-1`, teamId: "team-1", channelId: "ch-1", adaptiveCard: card },
      { botToken: `bot-framework-token-${tenantId}-1`, teamId: "team-1", channelId: "ch-2", adaptiveCard: card }
    ]);
  });

  test("should report a refused channel while the others are delivered", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);
    h.microsoftTeamsClient.refuse("ch-2", { failure: ChatPostFailure.Archived });

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1", "ch-2"],
      teamId: "team-1"
    });

    // Assert
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        { channelId: "ch-1", delivered: true },
        { channelId: "ch-2", delivered: false, failure: ChatPostFailure.Archived }
      ]
    });
  });

  test("should refuse a message without the team id and send nothing", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);

    // Action
    const result = h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1"]
    });

    // Assert
    await expect(result).rejects.toBeInstanceOf(RuleViolationError);
    await expect(result).rejects.toThrow("A Microsoft Teams message needs the team its channels are in");
    expect(h.microsoftTeamsClient.sent).toEqual([]);
  });

  test("should report every channel as failed when the bot is uninitialized instead of throwing", async () => {
    // Setup
    const h = await build();
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1", "ch-2"],
      teamId: "team-1"
    });

    // Assert
    const providerError = "Unable to send notification because the Microsoft Teams bot is uninitialized";
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        { channelId: "ch-1", delivered: false, failure: ChatPostFailure.Other, providerError },
        { channelId: "ch-2", delivered: false, failure: ChatPostFailure.Other, providerError }
      ]
    });
    expect(h.microsoftTeamsClient.sent).toEqual([]);
  });

  test("should report every channel as failed when the instance credentials are incomplete", async () => {
    // Setup
    const h = await build({});
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1"],
      teamId: "team-1"
    });

    // Assert
    expect(result).toEqual({
      integrationMissing: false,
      channels: [
        {
          channelId: "ch-1",
          delivered: false,
          failure: ChatPostFailure.Other,
          providerError: "Microsoft Teams app ID, client secret, or bot ID is not set"
        }
      ]
    });
    expect(h.microsoftTeamsClient.sent).toEqual([]);
  });

  test("should report every channel as failed when Microsoft does not issue a token", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    h.microsoftTeamsClient.failTokens = true;
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId);

    // Action
    const result = await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1"],
      teamId: "team-1"
    });

    // Assert
    expect(result).toMatchObject({
      integrationMissing: false,
      channels: [{ channelId: "ch-1", delivered: false, failure: ChatPostFailure.Other }]
    });
    expect(h.microsoftTeamsClient.sent).toEqual([]);
  });

  test("should reuse a cached bot token with more than five minutes left", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId, { value: "cached-bot-token", expiresInMs: 6 * MINUTE });

    // Action
    await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1"],
      teamId: "team-1"
    });

    // Assert
    expect(h.microsoftTeamsClient.issued).toEqual([]);
    expect(h.microsoftTeamsClient.sent.map((sent) => sent.botToken)).toEqual(["cached-bot-token"]);
  });

  test("should refresh a stale bot token, send with the new one and save it encrypted", async () => {
    // Setup
    const h = await build();
    initializeBot(h);
    const orgId = randomUUID();
    const integration = await seedTeams(h, orgId, { value: "stale-bot-token", expiresInMs: 4 * MINUTE });
    const { tenantId } = integration.microsoftTeamsInstallation();

    // Action
    await h.module.chatDeliveryService.post({
      orgId,
      integrationId: integration.id,
      message: teamsMessage,
      channelIds: ["ch-1"],
      teamId: "team-1"
    });

    // Assert
    const stored = await h.memory.workflowIntegrationStore.findById(integration.id);
    const saved = stored!.microsoftTeamsInstallation().toJSON().encryptedBotAccessToken!;
    expect(h.microsoftTeamsClient.sent.map((sent) => sent.botToken)).toEqual([`bot-framework-token-${tenantId}-1`]);
    expect(await h.decryptForOrg(orgId, saved)).toBe(`bot-framework-token-${tenantId}-1`);
  });
});
