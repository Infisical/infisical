export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS = 1000;

export const AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES = 18;

export const AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH = 512;
export const AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_INPUT_LENGTH = 1024;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export const AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS = 300;

export const AGENT_VAULT_ACTIVITY_MIN_BYTES_PER_RECORD = 60;

export const AGENT_VAULT_ACTIVITY_MAX_STORED_CHUNKS = 100_000;

export const AGENT_VAULT_ACTIVITY_STORAGE_CACHE_MS = 5 * 60_000;

export const AGENT_VAULT_ACTIVITY_CLOCK_SKEW_MS = 5 * 60_000;
export const AGENT_VAULT_ACTIVITY_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000;

export const AGENT_VAULT_ACTIVITY_MAX_PAGE_RECORDS = 5000;
export const AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_RECORDS = 1000;

export const AGENT_VAULT_ACTIVITY_MAX_PAGE_CHUNKS = 200;

export const AGENT_VAULT_ACTIVITY_MAX_PAGE_BYTES = 16 * 1024 * 1024;

export const AGENT_VAULT_ACTIVITY_RECEIVE_OVERLAP_MS = 2 * 60_000;

export const AgentVaultActivityStorageUnavailableReason = {
  NoConnection: "no-connection",
  ConnectionUnusable: "connection-unusable"
} as const;

// Wire contract: the Go proxy (cli/packages/agentvault/activity.go) switches on these APIError.Name values.
export const AgentVaultActivityErrorName = {
  CeilingReached: "AgentVaultActivityCeilingReached",
  Disabled: "AgentVaultActivityDisabled",
  ClockSkew: "AgentVaultActivityClockSkew"
} as const;
