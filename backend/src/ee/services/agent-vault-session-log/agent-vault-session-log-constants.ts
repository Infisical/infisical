import RE2 from "re2";

// A proxy uploads session logs in encrypted chunks. A record is one request an agent made. A chunk can't be bigger
// than 8 MiB, or smaller than an empty one: 30 bytes, a 12-byte IV, 2 bytes of content and a 16-byte tag.
export const AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES = 30; // the 12-byte IV, an empty "[]" and the 16-byte AES-GCM tag
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MiB
// Proxies seal at most 1,000 records per chunk; the bound only rejects nonsense, the count is never trusted for limits.
export const AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS = 10_000;

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
// file name carries the time of its last request, and the proxy never puts requests more than 10 minutes apart in one
// chunk. So the listing starts 11 minutes past the end of the range, and stops at the first chunk whose last request
// is before its start. Infisical refuses a chunk whose id time doesn't match its endedAt to within a second.
export const AGENT_VAULT_SESSION_LOG_RANGE_MARGIN_MS = 11 * 60_000; // 11 minutes
export const AGENT_VAULT_SESSION_LOG_CHUNK_ID_TIME_TOLERANCE_MS = 1_000;

// The live view (new requests appearing while the logs panel is open) doesn't list S3. Each time a proxy asks for
// an upload link, Infisical adds the chunk's file name to a small Redis list for that session, and the panel reads
// the names added since its last check. The list keeps the newest 10 names and is deleted 2 minutes after the last
// one was added. When the panel may have missed names that dropped off, it reads the newest page of history instead.
export const AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES = 10;
export const AGENT_VAULT_SESSION_LOG_FEED_TTL_SECONDS = 120; // 2 minutes

// What everyone but an Agent Vault admin sees when Infisical can't read the bucket: the first when AWS isn't answering,
// the second when an admin has to fix the settings or the AWS side. The admin message names the cause, which can
// mention the AWS account, bucket and connection.
export const AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE =
  "Session logs can't be read right now. Try again in a bit, or ask an Agent Vault admin if it keeps happening.";
// Default storage belongs to whoever runs Infisical, so no org admin can fix it: Infisical on cloud, the server
// administrator when self-hosted.
export const AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE =
  "Session logs can't be read right now. Try again in a bit, or contact Infisical support if it keeps happening.";
export const AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_SELF_HOSTED_MESSAGE =
  "Session logs can't be read right now. Try again in a bit, or contact your server administrator if it keeps happening.";
export const AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE =
  "Session logs can't be read. Ask an Agent Vault admin to check the session log settings.";

export const AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN =
  "Default storage for session logs isn't on your current plan. Upgrade your plan to use it.";
export const AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN =
  "External storage for session logs isn't on your current plan. Upgrade your plan to use it.";

// How long default storage keeps session logs when the plan's retention is null. The instance's lifecycle rule for
// each retention tag is what deletes them.
export const AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS = 30;
