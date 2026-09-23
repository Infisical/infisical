export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS = 1000;

// "[]" plus a 16-byte GCM tag is the smallest thing the proxy can legitimately seal.
export const AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES = 18;

/** The stored prefix, trailing slash included, has to fit the config column. */
export const AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH = 512;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES = 8 * 1024 * 1024;

export const AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS = 300;

/**
 * A floor on how much ciphertext a chunk must carry per record it claims. The record's JSON keys alone
 * run past 120 bytes before any value, so this is very slack. recordCount sizes the pages a viewer scrolls
 * through and is what they are told when a chunk cannot be read, so a proxy cannot claim records its bytes
 * could not hold.
 */
export const AGENT_VAULT_ACTIVITY_MIN_BYTES_PER_RECORD = 60;

/**
 * Ceiling on activity chunks indexed per organization. Chunks, not records: what costs us is one index row
 * per chunk, and a chunk holds anywhere from 1 to 1000 records, so a record count would cut off a busy
 * agent long before a quiet one for the same number of rows.
 *
 * Nothing frees room under it. A session that recorded activity is kept for good, since its row holds the
 * key that decrypts it, so an organization that reaches the ceiling stays there until it is raised. It is
 * ours to pick and not a customer-facing setting: neither the API, the UI nor the docs report it, and an
 * organization that reaches it is told to contact us. Raising it is a code change, which is the point at
 * which somebody should look at why it was reached.
 */
export const AGENT_VAULT_ACTIVITY_MAX_STORED_CHUNKS = 100_000;

/** A storage client is reused for this long rather than rebuilt per request. See the write path. */
export const AGENT_VAULT_ACTIVITY_STORAGE_CACHE_MS = 5 * 60_000;

export const AGENT_VAULT_ACTIVITY_CLOCK_SKEW_MS = 5 * 60_000;
export const AGENT_VAULT_ACTIVITY_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000;
export const AGENT_VAULT_ACTIVITY_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000;

/**
 * A page is measured in records, not chunks. A chunk holds anywhere from 1 to 1000 of them depending
 * on how busy the agent was, so paging by chunk hands a busy session thousands of rows and a quiet one
 * a handful, off the same number. The budget is what keeps a page the same size to read, and the same
 * weight for the browser, whatever the agent's pace.
 */
export const AGENT_VAULT_ACTIVITY_MAX_PAGE_RECORDS = 5000;
export const AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_RECORDS = 1000;

/** A ceiling on the walk, so a session of one-record chunks cannot make a page scan the whole table. */
export const AGENT_VAULT_ACTIVITY_MAX_PAGE_CHUNKS = 200;

/**
 * A page also stops at this much ciphertext, because the viewer downloads and decrypts every chunk on it.
 * Records are small and their agent-controlled fields are capped by the proxy, so 1000 of them stay near
 * 13 MB at the very worst. Without it a proxy could fill a page with 200 chunks claiming one record each at
 * 8 MiB apiece, and hand the viewer 1.6 GB to hold at once.
 */
export const AGENT_VAULT_ACTIVITY_MAX_PAGE_BYTES = 16 * 1024 * 1024;

/**
 * How far behind the moment of a read `nextReceivedAfter` points. A chunk's createdAt is stamped when its
 * insert begins, but the row only becomes visible once that transaction commits, and reads go to a replica
 * that can lag the primary. Either way a chunk can surface after a read that already ran past its
 * createdAt, so every read re-asks for this much of what came before it and the caller drops the repeats.
 */
export const AGENT_VAULT_ACTIVITY_RECEIVE_OVERLAP_MS = 2 * 60_000;

// The Go proxy reads these off APIError.Name to decide whether to pause or drop. Changing a value is a
// wire-contract change and needs the same change in cli/packages/agentvault/activity.go.
export const AgentVaultActivityErrorName = {
  CeilingReached: "AgentVaultActivityCeilingReached",
  Disabled: "AgentVaultActivityDisabled"
} as const;
