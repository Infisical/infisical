import { randomUUID } from "node:crypto";

import { RuleViolationError } from "@app/domains/lib/errors";

import { SecretsChatEvent } from "./secrets-chat-event";

const MAX_CHANNELS = 20;

export type TMicrosoftTeamsChannels = { teamId: string; channelIds: string[] };

const postable = (channels: TMicrosoftTeamsChannels | null): TMicrosoftTeamsChannels | null =>
  channels && channels.channelIds.length ? { teamId: channels.teamId, channelIds: [...channels.channelIds] } : null;

export type TMicrosoftTeamsProjectChatConfigRecord = {
  id: string;
  projectId: string;
  integrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: TMicrosoftTeamsChannels | null;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: TMicrosoftTeamsChannels | null;
};

export type TMicrosoftTeamsProjectChatConfigSettings = {
  integrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels?: TMicrosoftTeamsChannels;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels?: TMicrosoftTeamsChannels;
};

// Where a project's Microsoft Teams channels hear about Secret Manager events, through one Teams integration of its
// org. Teams has no channel for secret sync errors.
export class MicrosoftTeamsProjectChatConfig {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    private linkedIntegrationId: string,
    private isAccessRequestNotificationEnabled: boolean,
    private accessRequestChannels: TMicrosoftTeamsChannels | null,
    private isSecretRequestNotificationEnabled: boolean,
    private secretRequestChannels: TMicrosoftTeamsChannels | null
  ) {}

  // One team's channels, at least one and at most 20. Undefined stays undefined: that event has no channels.
  static sanitizeChannels(channels: TMicrosoftTeamsChannels | undefined): TMicrosoftTeamsChannels | undefined {
    if (channels === undefined) return undefined;
    if (channels.channelIds.length < 1) {
      throw new RuleViolationError({ message: "Select at least one Microsoft Teams channel" });
    }
    if (channels.channelIds.length > MAX_CHANNELS) {
      throw new RuleViolationError({ message: `You can only select up to ${MAX_CHANNELS} Microsoft Teams channels` });
    }
    return { teamId: channels.teamId, channelIds: [...channels.channelIds] };
  }

  static create(
    input: { projectId: string } & TMicrosoftTeamsProjectChatConfigSettings
  ): MicrosoftTeamsProjectChatConfig {
    const settings = MicrosoftTeamsProjectChatConfig.validatedSettings(input);
    return new MicrosoftTeamsProjectChatConfig(
      randomUUID(),
      input.projectId,
      settings.integrationId,
      settings.isAccessRequestNotificationEnabled,
      settings.accessRequestChannels,
      settings.isSecretRequestNotificationEnabled,
      settings.secretRequestChannels
    );
  }

  static restore(record: TMicrosoftTeamsProjectChatConfigRecord): MicrosoftTeamsProjectChatConfig {
    return new MicrosoftTeamsProjectChatConfig(
      record.id,
      record.projectId,
      record.integrationId,
      record.isAccessRequestNotificationEnabled,
      record.accessRequestChannels,
      record.isSecretRequestNotificationEnabled,
      record.secretRequestChannels
    );
  }

  private static validatedSettings(settings: TMicrosoftTeamsProjectChatConfigSettings) {
    if (settings.isAccessRequestNotificationEnabled && !settings.accessRequestChannels) {
      throw new RuleViolationError({
        message: "Access request channels are required when access request notifications are enabled"
      });
    }
    if (settings.isSecretRequestNotificationEnabled && !settings.secretRequestChannels) {
      throw new RuleViolationError({
        message: "Secret request channels are required when secret request notifications are enabled"
      });
    }
    if (!settings.secretRequestChannels && !settings.accessRequestChannels) {
      throw new RuleViolationError({
        message: "At least one of access request channels or secret request channels is required"
      });
    }
    return {
      integrationId: settings.integrationId,
      isAccessRequestNotificationEnabled: settings.isAccessRequestNotificationEnabled,
      accessRequestChannels: MicrosoftTeamsProjectChatConfig.sanitizeChannels(settings.accessRequestChannels) ?? null,
      isSecretRequestNotificationEnabled: settings.isSecretRequestNotificationEnabled,
      secretRequestChannels: MicrosoftTeamsProjectChatConfig.sanitizeChannels(settings.secretRequestChannels) ?? null
    };
  }

  // Replaces every setting: the settings form always sends them all.
  reconfigure(settings: TMicrosoftTeamsProjectChatConfigSettings): void {
    const next = MicrosoftTeamsProjectChatConfig.validatedSettings(settings);
    this.linkedIntegrationId = next.integrationId;
    this.isAccessRequestNotificationEnabled = next.isAccessRequestNotificationEnabled;
    this.accessRequestChannels = next.accessRequestChannels;
    this.isSecretRequestNotificationEnabled = next.isSecretRequestNotificationEnabled;
    this.secretRequestChannels = next.secretRequestChannels;
  }

  // The channels to post the event to, or null when the event is switched off, has no channels or is Slack only.
  channelsFor(event: SecretsChatEvent): TMicrosoftTeamsChannels | null {
    switch (event) {
      case SecretsChatEvent.AccessRequest:
        return this.isAccessRequestNotificationEnabled ? postable(this.accessRequestChannels) : null;
      case SecretsChatEvent.SecretChangeRequest:
        return this.isSecretRequestNotificationEnabled ? postable(this.secretRequestChannels) : null;
      default:
        return null;
    }
  }

  get integrationId(): string {
    return this.linkedIntegrationId;
  }

  toJSON(): TMicrosoftTeamsProjectChatConfigRecord {
    return {
      id: this.id,
      projectId: this.projectId,
      integrationId: this.linkedIntegrationId,
      isAccessRequestNotificationEnabled: this.isAccessRequestNotificationEnabled,
      accessRequestChannels: this.accessRequestChannels,
      isSecretRequestNotificationEnabled: this.isSecretRequestNotificationEnabled,
      secretRequestChannels: this.secretRequestChannels
    };
  }
}
