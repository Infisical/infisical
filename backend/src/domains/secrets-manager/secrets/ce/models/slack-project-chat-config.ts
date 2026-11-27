import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

import { SecretsChatEvent } from "./secrets-chat-event";

const MAX_CHANNELS = 20;

// project_slack_configs stores channels as one ", "-joined string, and the API returns it in that form.
export type TSlackProjectChatConfigRecord = {
  id: string;
  projectId: string;
  integrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
  isSecretSyncErrorNotificationEnabled: boolean;
  secretSyncErrorChannels: string;
};

export type TSlackProjectChatConfigSettings = {
  integrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels?: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels?: string;
  isSecretSyncErrorNotificationEnabled: boolean;
  secretSyncErrorChannels?: string;
};

// Where a project's Slack channels hear about Secret Manager events, through one Slack integration of its org.
export class SlackProjectChatConfig {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    private linkedIntegrationId: string,
    private isAccessRequestNotificationEnabled: boolean,
    private accessRequestChannels: string,
    private isSecretRequestNotificationEnabled: boolean,
    private secretRequestChannels: string,
    private isSecretSyncErrorNotificationEnabled: boolean,
    private secretSyncErrorChannels: string
  ) {}

  // Trims the ids and joins them with ", ". Refuses more than 20 channels.
  static sanitizeChannels(channels: string | undefined): string {
    const trimmed = (channels ?? "").trim();
    if (trimmed === "") return "";
    const sanitized = trimmed
      .split(",")
      .map((id) => id.trim())
      .join(", ");
    if (sanitized.split(",").length > MAX_CHANNELS) {
      throw new RuleViolationError({ message: `You can only select up to ${MAX_CHANNELS} slack channels` });
    }
    return sanitized;
  }

  static create(input: { projectId: string } & TSlackProjectChatConfigSettings): SlackProjectChatConfig {
    return new SlackProjectChatConfig(
      randomUUID(),
      input.projectId,
      input.integrationId,
      input.isAccessRequestNotificationEnabled,
      SlackProjectChatConfig.sanitizeChannels(input.accessRequestChannels),
      input.isSecretRequestNotificationEnabled,
      SlackProjectChatConfig.sanitizeChannels(input.secretRequestChannels),
      input.isSecretSyncErrorNotificationEnabled,
      SlackProjectChatConfig.sanitizeChannels(input.secretSyncErrorChannels)
    );
  }

  static restore(record: TSlackProjectChatConfigRecord): SlackProjectChatConfig {
    return new SlackProjectChatConfig(
      record.id,
      record.projectId,
      record.integrationId,
      record.isAccessRequestNotificationEnabled,
      record.accessRequestChannels,
      record.isSecretRequestNotificationEnabled,
      record.secretRequestChannels,
      record.isSecretSyncErrorNotificationEnabled,
      record.secretSyncErrorChannels
    );
  }

  // Replaces every setting: the settings form always sends them all.
  reconfigure(settings: TSlackProjectChatConfigSettings): void {
    const next = SlackProjectChatConfig.create({ projectId: this.projectId, ...settings }).toJSON();
    this.linkedIntegrationId = next.integrationId;
    this.isAccessRequestNotificationEnabled = next.isAccessRequestNotificationEnabled;
    this.accessRequestChannels = next.accessRequestChannels;
    this.isSecretRequestNotificationEnabled = next.isSecretRequestNotificationEnabled;
    this.secretRequestChannels = next.secretRequestChannels;
    this.isSecretSyncErrorNotificationEnabled = next.isSecretSyncErrorNotificationEnabled;
    this.secretSyncErrorChannels = next.secretSyncErrorChannels;
  }

  // The channel ids to post the event to, or null when the event is switched off or has no channels.
  channelsFor(event: SecretsChatEvent): string[] | null {
    const { isEnabled, channels } = this.settingsFor(event);
    const ids = channels.split(", ").filter(Boolean);
    return isEnabled && ids.length ? ids : null;
  }

  toJSON(): TSlackProjectChatConfigRecord {
    return {
      id: this.id,
      projectId: this.projectId,
      integrationId: this.linkedIntegrationId,
      isAccessRequestNotificationEnabled: this.isAccessRequestNotificationEnabled,
      accessRequestChannels: this.accessRequestChannels,
      isSecretRequestNotificationEnabled: this.isSecretRequestNotificationEnabled,
      secretRequestChannels: this.secretRequestChannels,
      isSecretSyncErrorNotificationEnabled: this.isSecretSyncErrorNotificationEnabled,
      secretSyncErrorChannels: this.secretSyncErrorChannels
    };
  }

  get integrationId(): string {
    return this.linkedIntegrationId;
  }

  private settingsFor(event: SecretsChatEvent): { isEnabled: boolean; channels: string } {
    switch (event) {
      case SecretsChatEvent.AccessRequest:
        return { isEnabled: this.isAccessRequestNotificationEnabled, channels: this.accessRequestChannels };
      case SecretsChatEvent.SecretChangeRequest:
        return { isEnabled: this.isSecretRequestNotificationEnabled, channels: this.secretRequestChannels };
      default:
        return { isEnabled: this.isSecretSyncErrorNotificationEnabled, channels: this.secretSyncErrorChannels };
    }
  }
}
