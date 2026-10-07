import RE2 from "re2";

// A proxy uploads session logs in encrypted chunks. A record is one request an agent made. A chunk can't be bigger
// than 8 MiB, or smaller than an empty one: 30 bytes, a 12-byte IV, 2 bytes of content and a 16-byte tag.
export const AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES = 30; // the 12-byte IV, an empty "[]" and the 16-byte AES-GCM tag
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB

// Lowercase because the browser rebuilds the AAD from the id in the object name. v7 because the name orders chunks
// by the time in the id.
export const AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN =
  "[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export const AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX = new RE2(`^${AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN}$`);

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

// Reading a session's logs (the logs panel, or GET .../logs) returns them a page at a time. For each page,
// Infisical lists the session's folder in S3 once and adds chunks until the page holds 48 KiB of them (about 200
// requests) or 200 chunks, but always at least one. The browser then downloads every chunk on the page, so a small
// page keeps opening the logs fast and cheap. The next page continues after the last file this one read.
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS = 200;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES = 48 * 1024; // 48 KiB of ciphertext

// When someone reads logs for a date range, Infisical has to find the chunks holding requests from it. A chunk's
// file name carries the time the proxy closed it, not the time of its requests, and a proxy can close a chunk up to
// about 2 minutes after its first request. So the listing starts 3 minutes past the end of the range.
export const AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS = 3 * 60_000; // 3 minutes

// The live view (new requests appearing while the logs panel is open) doesn't list S3. Each time a proxy asks for
// an upload link, Infisical adds the chunk's file name to a small Redis list for that session, and the panel reads
// the names added since its last check. The list keeps the newest 10 names and is deleted 2 minutes after the last
// one was added. A chunk that drops off before the panel reads it shows when the logs are reloaded.
export const AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES = 10;
export const AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS = 120; // 2 minutes

export const AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN =
  "Session logs are not available on your current plan. Please upgrade to continue.";
