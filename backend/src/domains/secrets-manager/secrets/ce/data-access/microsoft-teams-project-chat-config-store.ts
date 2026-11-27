import { TableName } from "@app/db/schemas";
import { TReadOptions, TStoreConnection } from "@app/domains/lib/data-access";
import { DatabaseError } from "@app/lib/errors";

import {
  MicrosoftTeamsProjectChatConfig,
  TMicrosoftTeamsChannels
} from "../models/microsoft-teams-project-chat-config";
import { TMicrosoftTeamsProjectChatConfigStore } from "../services/dependencies";

type TRow = {
  id: string;
  projectId: string;
  microsoftTeamsIntegrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  isSecretRequestNotificationEnabled: boolean;
  accessRequestChannels: unknown;
  secretRequestChannels: unknown;
};

// The jsonb column holds `{}` when an event has no channels, and a value in another shape reads as none.
const toChannels = (value: unknown): TMicrosoftTeamsChannels | null => {
  if (typeof value !== "object" || value === null) return null;
  const { teamId, channelIds } = value as { teamId?: unknown; channelIds?: unknown };
  if (typeof teamId !== "string" || !Array.isArray(channelIds)) return null;
  return { teamId, channelIds: channelIds.filter((id): id is string => typeof id === "string") };
};

const toModel = (row: TRow) =>
  MicrosoftTeamsProjectChatConfig.restore({
    id: row.id,
    projectId: row.projectId,
    integrationId: row.microsoftTeamsIntegrationId,
    isAccessRequestNotificationEnabled: row.isAccessRequestNotificationEnabled,
    accessRequestChannels: toChannels(row.accessRequestChannels),
    isSecretRequestNotificationEnabled: row.isSecretRequestNotificationEnabled,
    secretRequestChannels: toChannels(row.secretRequestChannels)
  });

export class MicrosoftTeamsProjectChatConfigStore implements TMicrosoftTeamsProjectChatConfigStore {
  constructor(private readonly connection: TStoreConnection) {}

  async findByProjectId(projectId: string, options?: TReadOptions): Promise<MicrosoftTeamsProjectChatConfig | null> {
    try {
      const row = (await this.connection
        .reader(options)(TableName.ProjectMicrosoftTeamsConfigs)
        .where({ projectId })
        .first()) as TRow | undefined;
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Find project Microsoft Teams config" });
    }
  }

  async upsert(config: MicrosoftTeamsProjectChatConfig): Promise<MicrosoftTeamsProjectChatConfig> {
    try {
      const record = config.toJSON();
      const [row] = (await this.connection
        .writer()(TableName.ProjectMicrosoftTeamsConfigs)
        .insert({
          id: record.id,
          projectId: record.projectId,
          microsoftTeamsIntegrationId: record.integrationId,
          isAccessRequestNotificationEnabled: record.isAccessRequestNotificationEnabled,
          accessRequestChannels: record.accessRequestChannels ?? {},
          isSecretRequestNotificationEnabled: record.isSecretRequestNotificationEnabled,
          secretRequestChannels: record.secretRequestChannels ?? {}
        } as never)
        .onConflict("projectId")
        .merge([
          "microsoftTeamsIntegrationId",
          "isAccessRequestNotificationEnabled",
          "accessRequestChannels",
          "isSecretRequestNotificationEnabled",
          "secretRequestChannels"
        ])
        .returning("*")) as TRow[];
      return toModel(row);
    } catch (error) {
      throw new DatabaseError({ error, name: "Upsert project Microsoft Teams config" });
    }
  }

  async deleteByProjectAndIntegration(
    projectId: string,
    integrationId: string
  ): Promise<MicrosoftTeamsProjectChatConfig | null> {
    try {
      const [row] = (await this.connection
        .writer()(TableName.ProjectMicrosoftTeamsConfigs)
        .where({ projectId, microsoftTeamsIntegrationId: integrationId })
        .delete()
        .returning("*")) as TRow[];
      return row ? toModel(row) : null;
    } catch (error) {
      throw new DatabaseError({ error, name: "Delete project Microsoft Teams config" });
    }
  }
}
