// The error name a session log read fails with when Infisical can't read the bucket. API callers switch on it.
export const AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE = "AgentVaultSessionLogStorageUnavailable";

// Wire contract: the Go proxy (cli/packages/agentvault/session_log.go) switches on these APIError.Name values.
export enum AgentVaultSessionLogErrorName {
  Disabled = "AgentVaultSessionLogDisabled",
  ClockSkew = "AgentVaultSessionLogClockSkew"
}
