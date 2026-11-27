import { SlackProjectChatConfig, TSlackProjectChatConfigRecord } from "../models/slack-project-chat-config";
import { TSlackProjectChatConfigStore } from "../services/dependencies";

export class InMemorySlackProjectChatConfigStore implements TSlackProjectChatConfigStore {
  private rows = new Map<string, TSlackProjectChatConfigRecord>();

  snapshot(): unknown {
    return new Map(this.rows);
  }

  restore(snapshot: unknown) {
    this.rows = new Map(snapshot as Map<string, TSlackProjectChatConfigRecord>);
  }

  async findByProjectId(projectId: string) {
    const record = this.rows.get(projectId);
    return record ? SlackProjectChatConfig.restore(record) : null;
  }

  async upsert(config: SlackProjectChatConfig) {
    const record = config.toJSON();
    const existing = this.rows.get(record.projectId);
    const stored = { ...record, id: existing?.id ?? record.id };
    this.rows.set(record.projectId, stored);
    return SlackProjectChatConfig.restore(stored);
  }

  async deleteByProjectAndIntegration(projectId: string, integrationId: string) {
    const record = this.rows.get(projectId);
    if (!record || record.integrationId !== integrationId) return null;
    this.rows.delete(projectId);
    return SlackProjectChatConfig.restore(record);
  }
}
