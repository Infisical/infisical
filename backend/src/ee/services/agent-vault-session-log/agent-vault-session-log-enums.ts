export enum AgentVaultSessionLogStorageUnavailableReason {
  NoConnection = "no-connection",
  ConnectionUnusable = "connection-unusable"
}

// Wire contract: the Go proxy (cli/packages/agentvault/session_log.go) switches on these APIError.Name values.
export enum AgentVaultSessionLogErrorName {
  CeilingReached = "AgentVaultSessionLogCeilingReached",
  Disabled = "AgentVaultSessionLogDisabled",
  ClockSkew = "AgentVaultSessionLogClockSkew"
}
