// What Secret Manager tells a project's chat channels about. Each event has its own channels and enable flag.
export enum SecretsChatEvent {
  AccessRequest = "access-request",
  SecretChangeRequest = "secret-change-request",
  SecretSyncError = "secret-sync-error"
}

// What a Secret Manager notification is about, which decides how it reads and which event's channels get it.
export enum SecretsChatNotificationType {
  SecretApproval = "secret-approval",
  AccessRequest = "access-request",
  AccessRequestUpdated = "access-request-updated",
  SecretSyncError = "secret-sync-error"
}
