import { TProjectsService } from "@app/domains/platform/projects/ce/module";
import {
  ChatMessage,
  TChatDeliveryService,
  TChatPostResult,
  WorkflowIntegrationProvider
} from "@app/domains/platform/workflow-integrations/ce/module";
import { logger } from "@app/lib/logger";

import { SecretsChatEvent, SecretsChatNotificationType } from "../../models/secrets-chat-event";
import { TMicrosoftTeamsProjectChatConfigStore, TSlackProjectChatConfigStore } from "../dependencies";
import { TSecretsChatNotification } from "./notification";
import { renderSlackMessage } from "./slack-message";
import { renderTeamsMessage } from "./teams-message";

export type { TSecretsChatNotification } from "./notification";

export type TSecretsChatNotificationService = {
  // Posts the notification to the channels the project chose for its event, on each provider it set up. Never
  // throws: a notification is a side effect of what the caller just did, so a failure is logged and nothing more.
  notify(input: { projectId: string; notification: TSecretsChatNotification }): Promise<void>;
};

const eventOf = (notification: TSecretsChatNotification): SecretsChatEvent => {
  switch (notification.type) {
    case SecretsChatNotificationType.SecretApproval:
      return SecretsChatEvent.SecretChangeRequest;
    case SecretsChatNotificationType.SecretSyncError:
      return SecretsChatEvent.SecretSyncError;
    default:
      return SecretsChatEvent.AccessRequest;
  }
};

export class SecretsChatNotificationService implements TSecretsChatNotificationService {
  constructor(
    private readonly slackProjectChatConfigStore: TSlackProjectChatConfigStore,
    private readonly microsoftTeamsProjectChatConfigStore: TMicrosoftTeamsProjectChatConfigStore,
    private readonly projectsService: TProjectsService,
    private readonly chatDeliveryService: TChatDeliveryService,
    private readonly siteUrl: string | undefined
  ) {}

  async notify({ projectId, notification }: { projectId: string; notification: TSecretsChatNotification }) {
    try {
      const project = await this.projectsService.findProject(projectId);
      if (!project) return;

      await Promise.all([
        this.notifySlack(project.orgId, projectId, notification),
        this.notifyMicrosoftTeams(project.orgId, projectId, notification)
      ]);
    } catch (error) {
      logger.error(error, "Error triggering workflow integration notification");
    }
  }

  private async notifySlack(orgId: string, projectId: string, notification: TSecretsChatNotification) {
    try {
      const config = await this.slackProjectChatConfigStore.findByProjectId(projectId);
      const channelIds = config?.channelsFor(eventOf(notification));
      if (!config || !channelIds) return;

      const result = await this.chatDeliveryService.post({
        orgId,
        integrationId: config.integrationId,
        message: ChatMessage.slack(renderSlackMessage(notification, this.siteUrl)),
        channelIds
      });
      this.logUndelivered(WorkflowIntegrationProvider.Slack, projectId, notification, result);
    } catch (error) {
      logger.error(error, `Error handling Slack notification. Project ID: ${projectId}`);
    }
  }

  private async notifyMicrosoftTeams(orgId: string, projectId: string, notification: TSecretsChatNotification) {
    try {
      const config = await this.microsoftTeamsProjectChatConfigStore.findByProjectId(projectId);
      const channels = config?.channelsFor(eventOf(notification));
      const message = channels ? renderTeamsMessage(notification, { orgId, siteUrl: this.siteUrl }) : null;
      if (!config || !channels || !message) return;

      const result = await this.chatDeliveryService.post({
        orgId,
        integrationId: config.integrationId,
        message: ChatMessage.microsoftTeams(message),
        channelIds: channels.channelIds,
        teamId: channels.teamId
      });
      this.logUndelivered(WorkflowIntegrationProvider.MicrosoftTeams, projectId, notification, result);
    } catch (error) {
      logger.error(error, `Error handling Microsoft Teams notification. Project ID: ${projectId}`);
    }
  }

  // eslint-disable-next-line class-methods-use-this
  private logUndelivered(
    provider: WorkflowIntegrationProvider,
    projectId: string,
    notification: TSecretsChatNotification,
    result: TChatPostResult
  ) {
    const context = `Notification type: ${notification.type}, Project ID: ${projectId}`;
    if (result.integrationMissing) {
      logger.error(`Error sending ${provider} notification. The integration no longer exists. ${context}`);
      return;
    }
    result.channels.forEach((outcome) => {
      if (!outcome.delivered) {
        logger.error(
          `Error sending ${provider} notification. Channel ID: ${outcome.channelId}, Failure: ${outcome.failure}${outcome.providerError ? ` (${outcome.providerError})` : ""}. ${context}`
        );
      }
    });
  }
}
