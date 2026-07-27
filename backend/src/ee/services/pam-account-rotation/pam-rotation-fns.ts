import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { PamAccountType } from "../pam/pam-enums";
import {
  isRotatableAccountType,
  isSqlRotatableType,
  isWindowsRotatableType,
  ROTATABLE_ACCOUNT_TYPES,
  SQL_ROTATABLE_ACCOUNT_TYPES,
  TRotatableType,
  TSqlRotatableType,
  TWindowsRotatableType,
  WINDOWS_ROTATABLE_ACCOUNT_TYPES
} from "../pam-account/pam-account-schemas";

// Rotatable-account-type sets and guards live with the central account-type config; re-exported here so the
// rotation module's existing consumers keep importing them from one place.
export {
  isRotatableAccountType,
  isSqlRotatableType,
  isWindowsRotatableType,
  ROTATABLE_ACCOUNT_TYPES,
  SQL_ROTATABLE_ACCOUNT_TYPES,
  TRotatableType,
  TSqlRotatableType,
  TWindowsRotatableType,
  WINDOWS_ROTATABLE_ACCOUNT_TYPES
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Strip a domain qualifier (DOMAIN\user or user@domain) to the bare sAMAccountName. Case is preserved; callers
// that need a case-insensitive comparison lowercase the result themselves.
export const toBareAccountName = (username: string): string => {
  if (username.includes("\\")) return username.split("\\").pop() ?? username;
  if (username.includes("@")) return username.split("@")[0];
  return username;
};

// Rotation talks to the target through a gateway tunnel; a transient tunnel/TLS/auth blip is not a real failure,
// so the probe throws on those and we retry, short-circuiting on a definitive result. Last error propagates.
export const GATEWAY_RETRY_ATTEMPTS = 3;

export const withGatewayRetry = async (
  probe: () => Promise<boolean>,
  label = "operation",
  { maxAttempts = GATEWAY_RETRY_ATTEMPTS, baseDelayMs = 500 }: { maxAttempts?: number; baseDelayMs?: number } = {}
): Promise<boolean> => {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await probe();
    } catch (err) {
      lastErr = err;
      logger.warn(
        { err },
        `PAM rotation ${label} attempt failed [attempt=${attempt}/${maxAttempts}] [error=${
          err instanceof Error ? err.message : String(err)
        }]`
      );
      // eslint-disable-next-line no-await-in-loop
      if (attempt < maxAttempts) await sleep(baseDelayMs * attempt);
    }
  }
  throw lastErr;
};

// PamAccountType -> AppConnection, so we can reuse the per-dialect ALTER statement map keyed by AppConnection.
export const PAM_ROTATION_APP_MAP: Record<
  TSqlRotatableType,
  AppConnection.Postgres | AppConnection.MySql | AppConnection.MsSql
> = {
  [PamAccountType.Postgres]: AppConnection.Postgres,
  [PamAccountType.MySQL]: AppConnection.MySql,
  [PamAccountType.MsSQL]: AppConnection.MsSql
};

export enum PamRotationReadinessIssue {
  UnsupportedType = "unsupported-type",
  NotConfigured = "not-configured",
  SelfRotationNoCredential = "self-rotation-no-credential"
}

type TRotationReadinessInput = {
  accountId: string;
  accountType: PamAccountType | string;
  rotationAccountId?: string | null;
  credentialConfigured: boolean;
};

// Account-level readiness as raw SQL, shared by the reconcile and impact count so they can't drift from each other
// or from getRotationReadiness below. "Will rotate" = a rotation account is set, and delegated or self-with-credential.
export const ACCOUNT_WILL_ROTATE_SQL = `"rotationAccountId" IS NOT NULL AND ("rotationAccountId" <> "id" OR "credentialConfigured")`;
export const ACCOUNT_NEEDS_ROTATION_ACCOUNT_SQL = `"rotationAccountId" IS NULL OR ("rotationAccountId" = "id" AND NOT "credentialConfigured")`;

export type TRotationReadiness = { ready: boolean; issue?: PamRotationReadinessIssue };

export const getRotationReadiness = (account: TRotationReadinessInput): TRotationReadiness => {
  if (!isRotatableAccountType(account.accountType)) {
    return { ready: false, issue: PamRotationReadinessIssue.UnsupportedType };
  }
  if (!account.rotationAccountId) return { ready: false, issue: PamRotationReadinessIssue.NotConfigured };

  const isSelfRotation = account.rotationAccountId === account.accountId;
  if (isSelfRotation && !account.credentialConfigured) {
    return { ready: false, issue: PamRotationReadinessIssue.SelfRotationNoCredential };
  }

  return { ready: true };
};

export const ROTATION_JITTER_CAP_SECONDS = 3600;
const ROTATION_JITTER_FACTOR = 0.1;

// A failed rotation retries after at most this instead of a full (possibly month-long) interval.
export const ROTATION_FAILURE_RETRY_CAP_SECONDS = 3600;

// Random spread on a due-date (10% of interval, capped) so a template's accounts don't all fire at once.
export const rotationJitterCapSeconds = (intervalSeconds: number, capSeconds = ROTATION_JITTER_CAP_SECONDS) =>
  Math.min(intervalSeconds * ROTATION_JITTER_FACTOR, capSeconds);

export const computeNextRotationAt = ({
  anchor,
  intervalSeconds,
  now,
  jitterCapSeconds = ROTATION_JITTER_CAP_SECONDS
}: {
  anchor: Date | null | undefined;
  intervalSeconds: number;
  now: Date;
  jitterCapSeconds?: number;
}): Date => {
  const base = Math.max((anchor ?? now).getTime() + intervalSeconds * 1000, now.getTime());
  const jitterMs = Math.floor(Math.random() * rotationJitterCapSeconds(intervalSeconds, jitterCapSeconds) * 1000);
  return new Date(base + jitterMs);
};

// A driver error can echo an interpolated password back, so strip secrets before storing or logging it.
export const redactRotationError = (err: unknown, secrets: (string | undefined)[]): string => {
  let message = err instanceof Error ? err.message : "Unknown error";
  for (const secret of secrets) {
    if (secret) message = message.replaceAll(secret, "******");
  }
  return message;
};
