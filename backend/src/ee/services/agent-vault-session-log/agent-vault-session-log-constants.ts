// A proxy uploads session logs in encrypted chunks. A record is one request an agent made. A chunk can't have more
// than 1,000 records (the Go proxy uploads once it has 1,000, sessionLogFlushRecords), and it can't be bigger than
// 8 MiB. Infisical also refuses a chunk that's too small to be real:
// - Any chunk under 18 bytes, the size of an empty chunk (2 bytes of content plus 16 bytes of encryption overhead)
// - A chunk under 60 bytes for each record it claims to hold. A chunk that claims 100 records must be at least
//   6,000 bytes, because no real record is smaller than 60 bytes, so a smaller chunk has a wrong count.
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS = 1000;
export const AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES = 18; // an empty "[]" plus the 16-byte AES-GCM tag
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB
export const AGENT_VAULT_SESSION_LOG_MIN_BYTES_PER_RECORD = 60; // well under the smallest real record, so only a lying count trips it

// Lowercase because Postgres returns uuids that way and the browser rebuilds the AAD from that string. v7 because
// history pages in chunk id order.
export const AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Infisical checks each chunk's timestamps, which come from the proxy's clock. If a chunk says it ended more than
// 5 minutes in the future, Infisical refuses it, because the proxy's clock is ahead. A session ends when it's
// revoked, when it expires, or when the user or machine identity that created it is deleted. From the first of
// those, its proxy has 24 hours to upload any chunks it still has, and later uploads are refused. A chunk that
// started more than 30 days ago is always refused, even for a session that's still running.
export const AGENT_VAULT_SESSION_LOG_CLOCK_SKEW_MS = 5 * 60_000; // 5 minutes
export const AGENT_VAULT_SESSION_LOG_LATE_CHUNK_GRACE_MS = 24 * 60 * 60_000; // 24 hours: after a session ends, its proxy has one more day to upload what it still holds
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_AGE_MS = 30 * 24 * 60 * 60_000; // 30 days: logs older than a month are never accepted, ended session or not

// Each organization can store up to 100,000 chunks, which is up to about 100 million requests. Once it reaches
// that, Infisical refuses new chunks and the error asks the customer to contact support. The limit isn't
// published, so the error doesn't state it.
export const AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS = 100_000;

// To download a chunk, the browser gets a link that expires after 5 minutes. For uploads and downloads, Infisical
// reuses the S3 client it built for the bucket for up to 5 minutes. Saving the settings or editing the connection
// replaces it at once.
export const AGENT_VAULT_SESSION_LOG_PRESIGN_EXPIRY_SECONDS = 300; // 5 minutes
export const AGENT_VAULT_SESSION_LOG_STORAGE_CACHE_MS = 5 * 60_000; // 5 minutes

// A page of session logs has 1,000 records by default, and the caller can ask for up to 5,000. A page can end
// sooner if it reaches 200 chunks or 16 MiB, and the next page picks up where it stopped. A live tail reads the
// last 2 minutes again each time, so a chunk that a proxy uploaded late still shows up.
export const AGENT_VAULT_SESSION_LOG_DEFAULT_PAGE_RECORDS = 1000;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_RECORDS = 5000;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_CHUNKS = 200;
export const AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES = 16 * 1024 * 1024; // 16 MiB of ciphertext
export const AGENT_VAULT_SESSION_LOG_RECEIVE_OVERLAP_MS = 2 * 60_000; // 2 minutes
