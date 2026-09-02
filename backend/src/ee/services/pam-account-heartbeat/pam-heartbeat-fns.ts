import { GatewayFailureKind } from "@app/lib/gateway-v2/test-connection-rpc";

import { PamHeartbeatStatus } from "../pam/pam-enums";
import { TPamHeartbeatConfig } from "../pam-account-template/pam-account-template-schemas";

export const HEARTBEAT_TIMEOUT_MS = 15_000;

export const HEARTBEAT_SSH_CERT_TTL_SECONDS = 60;

// Spreads a template's accounts so they don't all log in to one domain controller at the same instant.
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

// Retrying a rejected credential is how a monitoring feature locks out a privileged account.
export const stopsSchedule = (status: PamHeartbeatStatus) => status === PamHeartbeatStatus.InvalidCredentials;

// Unclassified resolves to rejected on purpose: an ambiguous result costs a false alarm, not a lockout.
export const statusForFailureKind = (kind: GatewayFailureKind | null): PamHeartbeatStatus => {
  if (kind === "transport") return PamHeartbeatStatus.CannotCheck;
  return PamHeartbeatStatus.InvalidCredentials;
};

// A gateway from before this feature reports no kind at all, so every one of its failures reads as a rejected
// credential. The status stays on the safe side, but the reason has to say the verdict is the gateway's age
// rather than an answer from the target.
export const UNCLASSIFIED_FAILURE_NOTE =
  "This gateway is too old to tell a rejected credential from an unreachable target. Update the gateway for an accurate result.";

export const describeFailure = (kind: GatewayFailureKind | null, message?: string): string | undefined => {
  if (kind !== null) return message;
  return message ? `${message}\n\n${UNCLASSIFIED_FAILURE_NOTE}` : UNCLASSIFIED_FAILURE_NOTE;
};

// Cloud accounts are brokered over HTTP, so the provider's status says what its prose only hints at. A status
// at all means the request was answered and the credential judged; 5xx, 408, and 429 are the provider having a
// bad day rather than a verdict on the credential.
const RETRYABLE_STATUSES = new Set([408, 429]);

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE"
]);

// Walks the cause chain the errors thrown by the federation helpers carry on their `error` field.
const httpStatusOf = (err: unknown): number | undefined => {
  let current = err;
  for (let depth = 0; current && typeof current === "object" && depth < 5; depth += 1) {
    const candidate = current as {
      response?: { status?: number };
      $metadata?: { httpStatusCode?: number };
      code?: unknown;
      error?: unknown;
      cause?: unknown;
    };
    const status = candidate.response?.status ?? candidate.$metadata?.httpStatusCode;
    if (typeof status === "number") return status;
    if (typeof candidate.code === "string" && CONNECTION_ERROR_CODES.has(candidate.code)) return undefined;
    current = candidate.error ?? candidate.cause;
  }
  return undefined;
};

export const classifyCloudProbeError = (err: unknown): PamHeartbeatStatus => {
  const status = httpStatusOf(err);
  if (status === undefined || status >= 500 || RETRYABLE_STATUSES.has(status)) {
    return PamHeartbeatStatus.CannotCheck;
  }
  return status >= 400 ? PamHeartbeatStatus.InvalidCredentials : PamHeartbeatStatus.CannotCheck;
};
