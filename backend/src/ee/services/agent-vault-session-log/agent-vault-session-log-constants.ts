// What a proxy's chunk upload may claim. The Go proxy flushes at 1000 records (sessionLogFlushRecords).
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS = 1000;
export const AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES = 18; // an empty "[]" plus the 16-byte AES-GCM tag
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB
export const AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD = 60; // well under the smallest real record, so only a lying count trips it

// When a chunk upload is accepted, relative to Infisical's clock and the session's end.
export const AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS = 5 * 60_000; // 5 minutes
export const AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000; // 24 hours: after a session ends, its proxy has one more day to upload what it still holds
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000; // 30 days: logs older than a month are never accepted, ended session or not

// Per-org cap on stored chunks; internal only, customers see "contact support".
export const AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS = 100_000;

// Bucket key prefix length. Mirrored in SessionLogModal.tsx.
export const AGENT_VAULT_SESSION_LOG_MAX_KEY_PREFIX_LENGTH = 512; // characters

// S3 access: presigned URL lifetime and how long a built S3 client is reused.
export const AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes
export const AGENT_VAULT_SESSION_LOG_STORAGE_CACHE_MS = 5 * 60_000; // 5 minutes

// Reading a session's logs: page size and budgets, and how far back a live tail re-reads.
export const AGENT_VAULT_SESSION_LOG_DEFAULT_PAGE_RECORDS = 1000;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_RECORDS = 5000;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS = 200;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES = 16 * 1024 * 1024; // 16 MiB of ciphertext
export const AGENT_VAULT_SESSION_LOG_RECEIVE_OVERLAP_MS = 2 * 60_000; // 2 minutes

export const AgentVaultSessionLogStorageUnavailableReason = {
  NoConnection: "no-connection",
  ConnectionUnusable: "connection-unusable"
} as const;

// Wire contract: the Go proxy (cli/packages/agentvault/session_log.go) switches on these APIError.Name values.
export const AgentVaultSessionLogErrorName = {
  CeilingReached: "AgentVaultSessionLogCeilingReached",
  Disabled: "AgentVaultSessionLogDisabled",
  ClockSkew: "AgentVaultSessionLogClockSkew"
} as const;
