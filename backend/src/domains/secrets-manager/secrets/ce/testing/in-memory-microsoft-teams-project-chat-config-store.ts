import {
  MicrosoftTeamsProjectChatConfig,
  TMicrosoftTeamsProjectChatConfigRecord
} from "../models/microsoft-teams-project-chat-config";
import { TMicrosoftTeamsProjectChatConfigStore } from "../services/dependencies";

export class InMemoryMicrosoftTeamsProjectChatConfigStore implements TMicrosoftTeamsProjectChatConfigStore {
  private rows = new Map<string, TMicrosoftTeamsProjectChatConfigRecord>();

  snapshot(): unknown {
    return new Map(this.rows);
  }

  restore(snapshot: unknown) {
    this.rows = new Map(snapshot as Map<string, TMicrosoftTeamsProjectChatConfigRecord>);
  }

  async findByProjectId(projectId: string) {
    const record = this.rows.get(projectId);
    return record ? MicrosoftTeamsProjectChatConfig.restore(record) : null;
  }

  async upsert(config: MicrosoftTeamsProjectChatConfig) {
    const record = config.toJSON();
    const existing = this.rows.get(record.projectId);
    const stored = { ...record, id: existing?.id ?? record.id };
    this.rows.set(record.projectId, stored);
    return MicrosoftTeamsProjectChatConfig.restore(stored);
  }

  async deleteByProjectAndIntegration(projectId: string, integrationId: string) {
    const record = this.rows.get(projectId);
    if (!record || record.integrationId !== integrationId) return null;
    this.rows.delete(projectId);
    return MicrosoftTeamsProjectChatConfig.restore(record);
  }
}
