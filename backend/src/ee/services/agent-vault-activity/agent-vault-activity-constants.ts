export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS = 1000;

// "[]" plus a 16-byte GCM tag is the smallest thing the proxy can legitimately seal.
export const AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES = 18;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export const AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS = 300;

/**
 * A floor on how much ciphertext a chunk must carry per record it claims. The record's JSON keys alone
 * run past 120 bytes before any value, so this is very slack; it exists because recordCount is what moves
 * the organization's ceiling, and without it a modified proxy could claim 1000 records per 18-byte chunk
 * and exhaust the ceiling for every session in the org in minutes.
 */
export const AGENT_VAULT_ACTIVITY_MIN_BYTES_PER_RECORD = 60;

/**
 * Ceiling on activity records indexed per organization. What it bounds is our row count and our
 * presign calls, not the customer's bucket, so it is ours to pick and not a customer-facing setting:
 * neither the API nor the UI reports it, and an organization that reaches it is told to contact us
 * rather than given a number to argue with. Raising it is a code change, which is the point at which
 * somebody should look at why it was reached.
 */
export const AGENT_VAULT_ACTIVITY_MAX_STORED_RECORDS = 10_000_000;

/** A storage client is reused for this long rather than rebuilt per request. See the write path. */
export const AGENT_VAULT_ACTIVITY_STORAGE_CACHE_MS = 5 * 60_000;

export const AGENT_VAULT_ACTIVITY_CLOCK_SKEW_MS = 5 * 60_000;
export const AGENT_VAULT_ACTIVITY_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000;

export const AGENT_VAULT_ACTIVITY_CEILING_WARN_RATIO = 0.8;

export const AGENT_VAULT_ACTIVITY_SWEEP_BATCH = 500;
export const AGENT_VAULT_ACTIVITY_MAX_PAGE_LIMIT = 100;
export const AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_LIMIT = 50;

// The Go proxy reads these off APIError.Name to decide whether to pause or drop. Changing a value is a
// wire-contract change and needs the same change in cli/packages/agentvault/activity.go.
export const AgentVaultActivityErrorName = {
  CeilingReached: "AgentVaultActivityCeilingReached",
  Disabled: "AgentVaultActivityDisabled"
} as const;
