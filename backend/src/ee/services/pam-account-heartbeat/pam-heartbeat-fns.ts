import { PamHeartbeatStatus } from "../pam/pam-enums";
import { TPamHeartbeatConfig } from "../pam-account-template/pam-account-template-schemas";

export const HEARTBEAT_TIMEOUT_MS = 15_000;

// The check issues a genuinely usable certificate, so it lives only as long as the probe itself needs.
export const HEARTBEAT_SSH_CERT_TTL_SECONDS = 60;

// A heartbeat is a real login attempt, so a whole template's accounts must not fire at the same instant against
// one domain controller. Same shape as rotation's jitter: a fraction of the interval, capped.
export const HEARTBEAT_JITTER_FACTOR = 0.1;
export const HEARTBEAT_JITTER_CAP_SECONDS = 30 * 60;

export const heartbeatJitterCapSeconds = (intervalSeconds: number, capSeconds = HEARTBEAT_JITTER_CAP_SECONDS) =>
  Math.min(intervalSeconds * HEARTBEAT_JITTER_FACTOR, capSeconds);

export const computeNextHeartbeatAt = ({
  anchor,
  intervalSeconds,
  now,
  jitterCapSeconds
}: {
  anchor: Date | null;
  intervalSeconds: number;
  now: Date;
  jitterCapSeconds?: number;
}): Date => {
  const base = Math.max((anchor ?? now).getTime() + intervalSeconds * 1000, now.getTime());
  const jitterMs = Math.floor(Math.random() * heartbeatJitterCapSeconds(intervalSeconds, jitterCapSeconds) * 1000);
  return new Date(base + jitterMs);
};

export const isHeartbeatScheduled = (heartbeat: TPamHeartbeatConfig | undefined): heartbeat is TPamHeartbeatConfig =>
  heartbeat?.enabled === true && heartbeat.intervalSeconds != null;

// A rejected credential takes the account off the schedule entirely: retrying a wrong password is how a monitoring
// feature locks out a customer's privileged account. A person clears it by fixing the credential, running a manual
// check, or rotating.
export const stopsSchedule = (status: PamHeartbeatStatus) => status === PamHeartbeatStatus.InvalidCredentials;

const TRANSPORT_ERROR_PATTERNS = [
  "etimedout",
  "econnrefused",
  "econnreset",
  "ehostunreach",
  "enetunreach",
  "enotfound",
  "eai_again",
  "socket hang up",
  "timeout",
  "timed out",
  "gateway",
  "tunnel"
];

// Cloud accounts (AWS IAM, GCP, Azure) are brokered by us rather than logged into, so there is no lockout to trigger
// and a rejection here means access was revoked. Transport failures still have to stay out of that bucket.
export const classifyCloudProbeError = (err: unknown): PamHeartbeatStatus => {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (TRANSPORT_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) return PamHeartbeatStatus.CannotCheck;
  return PamHeartbeatStatus.InvalidCredentials;
};
