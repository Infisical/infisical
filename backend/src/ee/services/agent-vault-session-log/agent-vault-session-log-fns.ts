import RE2 from "re2";
import { z } from "zod";

import { TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { logger } from "@app/lib/logger";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN,
  AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS
} from "./agent-vault-session-log-constants";
import { TResolvedSessionLogStorageConfig } from "./agent-vault-session-log-types";

export const withKeyPrefix = (keyPrefix: string | null | undefined, key: string) =>
  keyPrefix ? `${keyPrefix}/${key}` : key;

const MAX_REV = 9_999_999_999_999;

export const chunkIdTimeMs = (chunkId: string) => parseInt(chunkId.slice(0, 8) + chunkId.slice(9, 13), 16);

// S3 lists names in ascending order only, so names start with the time counted down: newest first.
export const toRev = (ms: number) => String(MAX_REV - Math.min(Math.max(Math.floor(ms), 0), MAX_REV)).padStart(13, "0");

export const buildSessionLogFolder = ({
  keyPrefix,
  projectId,
  sessionId
}: {
  keyPrefix?: string | null;
  projectId: string;
  sessionId: string;
}) => withKeyPrefix(keyPrefix, `${projectId}/${sessionId}/`);

export const buildSessionLogObjectKey = ({
  folder,
  proxyId,
  chunkId
}: {
  folder: string;
  proxyId: string;
  chunkId: string;
}) => `${folder}${toRev(chunkIdTimeMs(chunkId))}_${chunkId}.${proxyId}.json.enc`;

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SESSION_LOG_OBJECT_NAME_REGEX = new RE2(
  `^(\\d{13})_(${AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN})\\.(${UUID_PATTERN})\\.json\\.enc$`
);

// Anything else in the folder is skipped: only Infisical names objects there, through the links it signs.
export const parseSessionLogObjectKey = (folder: string, key: string) => {
  if (!key.startsWith(folder)) return null;
  const match = SESSION_LOG_OBJECT_NAME_REGEX.exec(key.slice(folder.length));
  if (!match) return null;
  const [, rev, chunkId, proxyId] = match;
  const lastRecordAtMs = chunkIdTimeMs(chunkId);
  if (rev !== toRev(lastRecordAtMs)) return null;
  return { chunkId, proxyId, lastRecordAt: new Date(lastRecordAtMs) };
};

export const resolveStorageConfig = (
  config: Pick<TAgentVaultSessionLogConfigs, "appConnectionId" | "bucket" | "region" | "keyPrefix"> | undefined
): TResolvedSessionLogStorageConfig | null => {
  if (!config?.appConnectionId || !config.bucket || !config.region) return null;
  return {
    appConnectionId: config.appConnectionId,
    bucket: config.bucket,
    region: config.region as AWSRegion,
    keyPrefix: config.keyPrefix ?? null
  };
};

const TEMPORARY_S3_ERRORS = new Set([
  "SlowDown",
  "InternalError",
  "ServiceUnavailable",
  "RequestTimeout",
  "TimeoutError"
]);
const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);
const CREDENTIAL_ERRORS = new Set(["InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken", "InvalidToken"]);
const ACCESS_ERRORS = new Set(["AccessDenied", "AllAccessDisabled"]);
const LOCATION_ERRORS = new Set([
  "NoSuchBucket",
  "PermanentRedirect",
  "AuthorizationHeaderMalformed",
  "IllegalLocationConstraintException"
]);

// Names the cause of a failed bucket listing for an admin, and whether trying again later can help.
export const describeListFailure = (error: Error, bucket: string) => {
  const { $fault, $metadata, code } = error as Error & {
    $fault?: string;
    $metadata?: { httpStatusCode?: number };
    code?: string;
  };
  const label = error.name === "Error" && code ? code : error.name;
  const isTemporary =
    $fault === "server" ||
    ($metadata?.httpStatusCode ?? 0) >= 500 ||
    TEMPORARY_S3_ERRORS.has(error.name) ||
    NETWORK_ERROR_CODES.has(code ?? "");

  let hint = "Check the AWS connection and the bucket settings.";
  if (isTemporary) hint = "S3 isn't responding. Try again in a bit.";
  else if (CREDENTIAL_ERRORS.has(error.name)) hint = "Check the AWS connection's credentials.";
  else if (ACCESS_ERRORS.has(error.name)) hint = "Check that the connection's credentials allow s3:ListBucket on it.";
  else if (LOCATION_ERRORS.has(error.name)) hint = "Check the bucket name and region in Settings.";

  return { isTemporary, message: `Infisical couldn't list session logs in bucket '${bucket}' (${label}). ${hint}` };
};

export const isSessionLogIngestEnabled = (config?: TAgentVaultSessionLogConfigs) =>
  Boolean(config?.enabled && resolveStorageConfig(config));

export type TSessionLogEntitlement = "licensed" | "unlicensed" | "unknown";

export type TSessionLogLicenseService = Pick<
  TLicenseServiceFactory,
  "getPlan" | "isServingFallbackPlan" | "getLastKnownPlan"
>;

const FALLBACK_LOG_INTERVAL_MS = 5 * 60_000;
const fallbackLoggedAt = new Map<string, number>();

// getPlan answers with the free plan while the License Server is down, which would otherwise read as a downgrade
// and stop recording. "unknown" is a fallback with no recent real answer to go on.
export const getSessionLogEntitlement = async (
  licenseService: TSessionLogLicenseService,
  orgId: string
): Promise<TSessionLogEntitlement> => {
  if ((await licenseService.getPlan(orgId)).agentVaultByoS3) return "licensed";
  if (!(await licenseService.isServingFallbackPlan(orgId))) return "unlicensed";

  const lastKnown = await licenseService.getLastKnownPlan(orgId);
  let entitlement: TSessionLogEntitlement = "unknown";
  if (lastKnown && Date.now() - lastKnown.fetchedAt <= AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS) {
    entitlement = lastKnown.plan.agentVaultByoS3 ? "licensed" : "unlicensed";
  }

  const now = Date.now();
  if (now - (fallbackLoggedAt.get(orgId) ?? 0) >= FALLBACK_LOG_INTERVAL_MS) {
    fallbackLoggedAt.set(orgId, now);
    logger.warn(
      `agentVaultSessionLog: the plan is a License Server fallback, deciding session logs from the last known plan [orgId=${orgId}] [entitlement=${entitlement}] [lastKnownAgeMs=${lastKnown ? now - lastKnown.fetchedAt : "none"}]`
    );
  }
  return entitlement;
};

const CURSOR_VERSION = 2;
// Large enough for any S3 key, which can be up to 1,024 bytes, after JSON and base64.
const MAX_CURSOR_LENGTH = 8192;

export const SESSION_LOG_FEED_START = "0-0";

const HistoryCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("h"),
  after: z.string().min(1).max(1024)
});

const TailCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("t"),
  id: z.string().regex(new RE2(/^\d{1,16}-\d{1,16}$/))
});

const encode = (payload: object) => Buffer.from(JSON.stringify(payload)).toString("base64url");

const decode = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
};

// The name relative to the session folder, so a cursor can't point a list outside it.
export const encodeHistoryCursor = (after: string) => encode({ v: CURSOR_VERSION, m: "h", after });

export const encodeTailCursor = (feedEntryId: string) => encode({ v: CURSOR_VERSION, m: "t", id: feedEntryId });

const modeOf = (payload: unknown) =>
  payload && typeof payload === "object" && "m" in payload ? (payload as { m: unknown }).m : undefined;

export const HistoryCursorSchema = z
  .string()
  .trim()
  .max(MAX_CURSOR_LENGTH)
  .transform((cursor, ctx) => {
    const payload = decode(cursor);
    const parsed = HistoryCursorPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          modeOf(payload) === "t"
            ? "This cursor is for reading new logs as they arrive. Pass it to the session logs tail endpoint instead"
            : "Invalid cursor. Pass the nextCursor of a previous response unchanged"
      });
      return z.NEVER;
    }
    return parsed.data.after;
  });

export const TailCursorSchema = z
  .string()
  .trim()
  .max(MAX_CURSOR_LENGTH)
  .transform((cursor, ctx) => {
    const payload = decode(cursor);
    const parsed = TailCursorPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          modeOf(payload) === "h"
            ? "This cursor is for paging back through logs. Pass it to the session logs endpoint instead"
            : "Invalid cursor. Pass the nextCursor of a previous response unchanged"
      });
      return z.NEVER;
    }
    return parsed.data.id;
  });
