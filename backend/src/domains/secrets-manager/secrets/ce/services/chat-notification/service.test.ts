import { randomUUID } from "node:crypto";

import { ChatPostFailure, WorkflowIntegrationProvider } from "@app/domains/platform/workflow-integrations/ce/module";

import { MicrosoftTeamsProjectChatConfig } from "../../models/microsoft-teams-project-chat-config";
import { SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { SlackProjectChatConfig } from "../../models/slack-project-chat-config";
import { buildProjectChatConfig, SITE_URL } from "../../testing/build-project-chat-config";
import { TSecretsChatNotification } from "./service";
import { renderSlackMessage } from "./slack-message";
import { renderTeamsMessage } from "./teams-message";

const { logError } = vi.hoisted(() => ({ logError: vi.fn() }));
vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: logError, debug: vi.fn() } }));

beforeEach(() => {
  logError.mockClear();
});

const accessRequest = (): TSecretsChatNotification => ({
  type: SecretsChatNotificationType.AccessRequest,
  payload: {
    requesterFullName: "Ada Lovelace",
    requesterEmail: "ada@example.com",
    isTemporary: true,
    secretPath: "/app",
    environment: "prod",
    projectName: "Payments",
    projectPath: "/p",
    permissions: ["read"],
    approvalUrl: "https://example.test/approve"
  }
});

const secretApproval = (): TSecretsChatNotification => ({
  type: SecretsChatNotificationType.SecretApproval,
  payload: {
    userEmail: "ada@example.com",
    environment: "prod",
    secretPath: "/app",
    requestId: "req-1",
    projectId: "proj-1",
    projectName: "Payments",
    secretKeys: ["A"],
    approvalUrl: "https://example.test/approve"
  }
});

const syncError = (): TSecretsChatNotification => ({
  type: SecretsChatNotificationType.SecretSyncError,
  payload: {
    syncName: "s",
    syncActionLabel: "Sync",
    syncDestination: "AWS",
    failureMessage: "boom",
    syncUrl: "https://example.test/sync",
    environment: "prod",
    secretPath: "/",
    projectName: "Payments",
    projectPath: "/p"
  }
});

const setup = async () => {
  const t = buildProjectChatConfig();
  const slackIntegrationId = randomUUID();
  const teamsIntegrationId = randomUUID();
  const configureSlack = (overrides: Partial<Parameters<typeof SlackProjectChatConfig.create>[0]> = {}) =>
    t.memory.slackProjectChatConfigStore.upsert(
      SlackProjectChatConfig.create({
        projectId: t.projectId,
        integrationId: slackIntegrationId,
        isAccessRequestNotificationEnabled: true,
        accessRequestChannels: "CA1, CA2",
        isSecretRequestNotificationEnabled: true,
        secretRequestChannels: "CS1",
        isSecretSyncErrorNotificationEnabled: true,
        secretSyncErrorChannels: "CE1",
        ...overrides
      })
    );
  const configureTeams = (overrides: Partial<Parameters<typeof MicrosoftTeamsProjectChatConfig.create>[0]> = {}) =>
    t.memory.microsoftTeamsProjectChatConfigStore.upsert(
      MicrosoftTeamsProjectChatConfig.create({
        projectId: t.projectId,
        integrationId: teamsIntegrationId,
        isAccessRequestNotificationEnabled: true,
        accessRequestChannels: { teamId: "team-1", channelIds: ["ta1"] },
        isSecretRequestNotificationEnabled: true,
        secretRequestChannels: { teamId: "team-2", channelIds: ["ts1", "ts2"] },
        ...overrides
      })
    );
  return { ...t, slackIntegrationId, teamsIntegrationId, configureSlack, configureTeams };
};

describe("SecretsChatNotificationService.notify", () => {
  test("should post an access request to the Slack channels of its event with the rendered message", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    const notification = accessRequest();

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification });

    // Assert
    expect(t.chatDeliveryService.posts).toHaveLength(1);
    const [post] = t.chatDeliveryService.posts;
    expect(post).toMatchObject({
      orgId: t.orgId,
      integrationId: t.slackIntegrationId,
      channelIds: ["CA1", "CA2"]
    });
    expect(post.message.toJSON()).toEqual({
      provider: WorkflowIntegrationProvider.Slack,
      slack: renderSlackMessage(notification, SITE_URL)
    });
  });

  test("should post a secret approval to the Slack and the Teams channels of the secret change request event", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    await t.configureTeams();
    const notification = secretApproval();

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification });

    // Assert
    const posts = t.chatDeliveryService.posts.map((post) => ({
      integrationId: post.integrationId,
      channelIds: post.channelIds,
      teamId: post.teamId,
      message: post.message.toJSON()
    }));
    expect(posts).toHaveLength(2);
    expect(posts).toContainEqual({
      integrationId: t.slackIntegrationId,
      channelIds: ["CS1"],
      teamId: undefined,
      message: { provider: WorkflowIntegrationProvider.Slack, slack: renderSlackMessage(notification, SITE_URL) }
    });
    expect(posts).toContainEqual({
      integrationId: t.teamsIntegrationId,
      channelIds: ["ts1", "ts2"],
      teamId: "team-2",
      message: {
        provider: WorkflowIntegrationProvider.MicrosoftTeams,
        microsoftTeams: renderTeamsMessage(notification, { orgId: t.orgId, siteUrl: SITE_URL })
      }
    });
  });

  test("should post a secret sync error to Slack only", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    await t.configureTeams();

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: syncError() });

    // Assert
    expect(t.chatDeliveryService.posts.map((post) => [post.integrationId, post.channelIds])).toEqual([
      [t.slackIntegrationId, ["CE1"]]
    ]);
  });

  test("should post nothing for an event that is switched off", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack({ isAccessRequestNotificationEnabled: false });
    await t.configureTeams({ isAccessRequestNotificationEnabled: false });

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: accessRequest() });

    // Assert
    expect(t.chatDeliveryService.posts).toEqual([]);
  });

  test("should post nothing for an enabled event without channels", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack({ secretSyncErrorChannels: "" });

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: syncError() });

    // Assert
    expect(t.chatDeliveryService.posts).toEqual([]);
  });

  test("should post nothing when the project has no chat settings", async () => {
    // Setup
    const t = await setup();

    // Action
    await t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: accessRequest() });

    // Assert
    expect(t.chatDeliveryService.posts).toEqual([]);
  });

  test("should post nothing when the project does not exist", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();

    // Action
    await t.secretsChatNotificationService.notify({ projectId: randomUUID(), notification: accessRequest() });

    // Assert
    expect(t.chatDeliveryService.posts).toEqual([]);
  });

  test("should not throw when a channel refuses the message, and still post to the other provider", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    await t.configureTeams();
    t.chatDeliveryService.refuse("CA1", { failure: ChatPostFailure.NotInChannel });

    // Action
    const result = t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: accessRequest() });

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(t.chatDeliveryService.posts.map((post) => post.integrationId).sort()).toEqual(
      [t.slackIntegrationId, t.teamsIntegrationId].sort()
    );
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("Channel ID: CA1"));
  });

  test("should not throw when the integration no longer exists", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    t.chatDeliveryService.markMissing(t.slackIntegrationId);

    // Action
    const result = t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: accessRequest() });

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("no longer exists"));
  });

  test("should not throw when posting fails, and still post to the other provider", async () => {
    // Setup
    const t = await setup();
    await t.configureSlack();
    await t.configureTeams();
    const post = t.chatDeliveryService.post.bind(t.chatDeliveryService);
    t.chatDeliveryService.post = async (input) => {
      if (input.integrationId === t.slackIntegrationId) throw new Error("kms is down");
      return post(input);
    };

    // Action
    const result = t.secretsChatNotificationService.notify({ projectId: t.projectId, notification: accessRequest() });

    // Assert
    await expect(result).resolves.toBeUndefined();
    expect(t.chatDeliveryService.posts.map((delivered) => delivered.integrationId)).toEqual([t.teamsIntegrationId]);
    expect(logError).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("Slack notification"));
  });
});
