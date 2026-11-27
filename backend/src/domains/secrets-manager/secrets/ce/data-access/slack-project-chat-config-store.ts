import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import { SlackProjectChatConfig } from "../models/slack-project-chat-config";
import { TSlackProjectChatConfigStore } from "../services/dependencies";

type TRow = {
  id: string;
  projectId: string;
  slackIntegrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
  isSecretSyncErrorNotificationEnabled: boolean;
  secretSyncErrorChannels: string;
};

const toModel = (row: TRow) =>
  SlackProjectChatConfig.restore({
    id: row.id,
    projectId: row.projectId,
    integrationId: row.slackIntegrationId,
    isAccessRequestNotificationEnabled: row.isAccessRequestNotificationEnabled,
    accessRequestChannels: row.accessRequestChannels,
    isSecretRequestNotificationEnabled: row.isSecretRequestNotificationEnabled,
    secretRequestChannels: row.secretRequestChannels,
    isSecretSyncErrorNotificationEnabled: row.isSecretSyncErrorNotificationEnabled,
    secretSyncErrorChannels: row.secretSyncErrorChannels
  });

export class SlackProjectChatConfigStore implements TSlackProjectChatConfigStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findByProjectId(projectId: string, options?: TReadOptions): Promise<SlackProjectChatConfig | null> {
    try {
      const row = (await this.connection
        .reader(options)(TableName.ProjectSlackConfigs)
        .where({ projectId })
        .first()) as TRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project Slack config" });
    }
  }

  async upsert(config: SlackProjectChatConfig): Promise<SlackProjectChatConfig> {
    try {
      const record = config.toJSON();
      const [row] = (await this.connection
        .writer()(TableName.ProjectSlackConfigs)
        .insert({
          id: record.id,
          projectId: record.projectId,
          slackIntegrationId: record.integrationId,
          isAccessRequestNotificationEnabled: record.isAccessRequestNotificationEnabled,
          accessRequestChannels: record.accessRequestChannels,
          isSecretRequestNotificationEnabled: record.isSecretRequestNotificationEnabled,
          secretRequestChannels: record.secretRequestChannels,
          isSecretSyncErrorNotificationEnabled: record.isSecretSyncErrorNotificationEnabled,
          secretSyncErrorChannels: record.secretSyncErrorChannels
        } as never)
        .onConflict("projectId")
        .merge([
          "slackIntegrationId",
          "isAccessRequestNotificationEnabled",
          "accessRequestChannels",
          "isSecretRequestNotificationEnabled",
          "secretRequestChannels",
          "isSecretSyncErrorNotificationEnabled",
          "secretSyncErrorChannels"
        ])
        .returning("*")) as TRow[];
      return toModel(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert project Slack config" });
    }
  }

  async deleteByProjectAndIntegration(
    projectId: string,
    integrationId: string
  ): Promise<SlackProjectChatConfig | null> {
    try {
      const [row] = (await this.connection
        .writer()(TableName.ProjectSlackConfigs)
        .where({ projectId, slackIntegrationId: integrationId })
        .delete()
        .returning("*")) as TRow[];
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete project Slack config" });
    }
  }
}
