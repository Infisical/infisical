// Node/OS-level socket error codes that indicate a transient network failure worth retrying.
export const RETRYABLE_NETWORK_ERRORS = [
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "ENETUNREACH",
  "EHOSTUNREACH"
];
