// Stored in workflow_integrations.integration.
export enum WorkflowIntegrationProvider {
  Slack = "slack",
  MicrosoftTeams = "microsoft-teams"
}

// Stored in workflow_integrations.status. The column also allows "failed", which nothing writes.
export enum WorkflowIntegrationStatus {
  Pending = "pending",
  Installed = "installed"
}

// Why one channel did not get a message. Clients map provider errors into these so callers never read provider codes.
export enum ChatPostFailure {
  NotInChannel = "not-in-channel",
  ChannelNotFound = "channel-not-found",
  Archived = "archived",
  AuthRejected = "auth-rejected",
  RateLimited = "rate-limited",
  Unreachable = "unreachable",
  Other = "other"
}
