// A proxy uploads session logs in encrypted chunks. A record is one request an agent made. A chunk can't be bigger
// than 8 MiB, or smaller than an empty one: 30 bytes, a 12-byte IV, 2 bytes of content and a 16-byte tag.
export const AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES = 30; // the 12-byte IV, an empty "[]" and the 16-byte AES-GCM tag
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB

// Lowercase because the browser rebuilds the AAD from the id in the object name. v7 because the name orders chunks
// by the time in the id.
export const AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Infisical checks when each chunk ended, which comes from the proxy's clock. If a chunk says it ended more than
// 5 minutes in the future, Infisical refuses it, because the proxy's clock is ahead. A proxy holds chunks only in
// memory, so one that says it ended more than 30 days ago means the clock is behind, and is refused the same way.
// A session ends when it's revoked, when it expires, or when the user or machine identity that created it is
// deleted. From the first of those, its proxy has 24 hours to upload any chunks it still has, and later uploads
// are refused.
export const AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS = 5 * 60_000; // 5 minutes
export const AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000; // 24 hours: after a session ends, its proxy has one more day to upload what it still holds
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000; // 30 days: a chunk that ended longer ago than this means the proxy's clock is behind

// While the License Server can't be reached, the last plan it returned decides for this long, so a downgrade
// still lands within an hour of an outage starting.
export const AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS = 60 * 60_000; // 1 hour

// A link to upload or download a chunk expires after 5 minutes.
export const AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes

// A page of session logs ends once it holds 48 KiB of chunks or 200 chunks, whichever comes first, and always holds
// at least one. 48 KiB is about 200 requests. Each page is one S3 list call plus one browser download per chunk,
// so a small page keeps opening the logs cheap. The next page starts after the last name it read.
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS = 200;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES = 48 * 1024; // 48 KiB of ciphertext

// A chunk is named by when it was sealed, which can be about 2 minutes after its first record, so a date range
// starts listing that much past its end.
export const AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS = 3 * 60_000; // 3 minutes

// The live view reads a short Redis stream per session holding the names of the newest chunks. It keeps the last
// 10 and disappears 2 minutes after the last one; anything it misses shows on the next full read.
export const AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES = 10;
export const AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS = 120; // 2 minutes

export const AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN =
  "Session logs are not available on your current plan. Please upgrade to continue.";
