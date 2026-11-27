import { WorkflowIntegrationProvider } from "./enums";

// Slack Block Kit: `text` is the fallback for clients without blocks.
export type TSlackMessage = { text: string; blocks?: unknown[]; attachments?: unknown[] };

export type TMicrosoftTeamsMessage = { adaptiveCard: Record<string, unknown> };

export type TChatMessageRecord =
  | { provider: WorkflowIntegrationProvider.Slack; slack: TSlackMessage }
  | { provider: WorkflowIntegrationProvider.MicrosoftTeams; microsoftTeams: TMicrosoftTeamsMessage };

// A message already rendered for one provider. The domain posts it as given: what it says is the caller's business.
export class ChatMessage {
  private constructor(private readonly record: TChatMessageRecord) {}

  static slack(message: TSlackMessage): ChatMessage {
    return new ChatMessage({ provider: WorkflowIntegrationProvider.Slack, slack: message });
  }

  static microsoftTeams(message: TMicrosoftTeamsMessage): ChatMessage {
    return new ChatMessage({ provider: WorkflowIntegrationProvider.MicrosoftTeams, microsoftTeams: message });
  }

  get provider(): WorkflowIntegrationProvider {
    return this.record.provider;
  }

  toJSON(): TChatMessageRecord {
    return this.record;
  }
}
