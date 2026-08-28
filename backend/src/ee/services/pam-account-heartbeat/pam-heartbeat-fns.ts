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

const TRANSPORT_ERROR_PATTERNS = [
  "etimedout",
  "econnrefused",
  "econnreset",
  "ehostunreach",
  "enetunreach",
  "enotfound",
  "eai_again",
  "socket hang up",
  "x509",
  "tls",
  "certificate",
  "service unavailable",
  "internalfailure",
  "internal server error",
  "bad gateway",
  "throttl",
  "slowdown",
  "rate exceeded",
  "too many requests",
  "timeout",
  "timed out",
  "gateway",
  "tunnel"
];

// Unclassified resolves to rejected on purpose: an ambiguous result costs a false alarm, not a lockout.
export const statusForFailureKind = (kind: GatewayFailureKind | null): PamHeartbeatStatus => {
  if (kind === "transport") return PamHeartbeatStatus.CannotCheck;
  return PamHeartbeatStatus.InvalidCredentials;
};

// Cloud accounts have no lockout, so the bias inverts: only a recognised rejection stops the schedule.
const CLOUD_REJECTION_PATTERNS = [
  "accessdenied",
  "access denied",
  "unauthorized",
  "unauthorised",
  "invalid_client",
  "invalid_grant",
  "invalidclienttokenid",
  "signaturedoesnotmatch",
  "expiredtoken",
  "invalid credentials",
  "permission denied",
  "forbidden",
  "not authorized to perform",
  "invalid jwt",
  "is disabled",
  "has been deleted"
];

export const classifyCloudProbeError = (err: unknown): PamHeartbeatStatus => {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (TRANSPORT_ERROR_PATTERNS.some((pattern) => message.includes(pattern))) return PamHeartbeatStatus.CannotCheck;
  if (CLOUD_REJECTION_PATTERNS.some((pattern) => message.includes(pattern))) {
    return PamHeartbeatStatus.InvalidCredentials;
  }
  return PamHeartbeatStatus.CannotCheck;
};
