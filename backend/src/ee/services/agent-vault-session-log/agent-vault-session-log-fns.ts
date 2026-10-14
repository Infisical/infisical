import RE2 from "re2";
import { z } from "zod";

import { ProjectType, TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TFeatureSet } from "@app/ee/services/license/license-types";
import { logger } from "@app/lib/logger";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { isDefaultStorageConfigured } from "@app/services/object-storage/object-storage-default-fns";
import {
  AWS_ACCESS_ERRORS,
  AWS_CREDENTIAL_ERRORS,
  AWS_LOCATION_ERRORS,
  ObjectStorageError
} from "@app/services/object-storage/object-storage-errors";
import { defineStorageNamespace } from "@app/services/object-storage/object-storage-namespace-fns";
import {
  ObjectStorageErrorReason,
  ObjectStorageType,
  TStorageConfig
} from "@app/services/object-storage/object-storage-types";

import { TAgentVaultSessionLogConfigDALFactory } from "./agent-vault-session-log-config-dal";
import {
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_PATTERN,
  AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS,
  AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS,
  AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE
} from "./agent-vault-session-log-constants";

export const AgentVaultSessionLogsNamespace = defineStorageNamespace({
  id: "agent-vault.session-logs",
  product: "agent-vault",
  path: "sessions/{sessionId}/logs/{file}"
});

const MAX_REV = 9_999_999_999_999;

export const chunkIdTimeMs = (chunkId: string) => parseInt(chunkId.slice(0, 8) + chunkId.slice(9, 13), 16);

// S3 lists names in ascending order only, so names start with the time counted down: newest first.
export const toRev = (ms: number) => String(MAX_REV - Math.min(Math.max(Math.floor(ms), 0), MAX_REV)).padStart(13, "0");

export const buildSessionLogObjectName = ({ proxyId, chunkId }: { proxyId: string; chunkId: string }) =>
  `${toRev(chunkIdTimeMs(chunkId))}_${chunkId}.${proxyId}.json.enc`;

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

export type TSessionLogStorage =
  | { type: ObjectStorageType.Default }
  | {
      type: ObjectStorageType.External;
      appConnectionId: string;
      bucket: string;
      region: AWSRegion;
      keyPrefix: string | null;
    };

export type TEffectiveSessionLogConfig = { enabled: boolean; isSaved: boolean; storage: TSessionLogStorage };

// What session logs do for a project, from its saved row and whether the instance has a bucket. With nothing saved,
// session logs are on in default storage. Without an instance bucket there is no default storage, so a saved
// default choice, or nothing saved, means there are no settings. It never looks at the plan.
export const toEffectiveSessionLogConfig = (
  row:
    | Pick<
        TAgentVaultSessionLogConfigs,
        "enabled" | "storageType" | "appConnectionId" | "bucket" | "region" | "keyPrefix"
      >
    | null
    | undefined,
  hasDefaultStorage: boolean
): TEffectiveSessionLogConfig | null => {
  if (row?.storageType === ObjectStorageType.External && row.appConnectionId && row.bucket && row.region) {
    return {
      enabled: row.enabled,
      isSaved: true,
      storage: {
        type: ObjectStorageType.External,
        appConnectionId: row.appConnectionId,
        bucket: row.bucket,
        region: row.region as AWSRegion,
        keyPrefix: row.keyPrefix || null
      }
    };
  }
  if (!hasDefaultStorage) return null;
  // An external row without its bucket can only come from a pod on the previous version during a deploy, and those
  // were always off.
  const enabled = row ? row.storageType === ObjectStorageType.Default && row.enabled : true;
  return { enabled, isSaved: Boolean(row), storage: { type: ObjectStorageType.Default } };
};

export const getEffectiveSessionLogConfig = async (
  {
    agentVaultSessionLogConfigDAL
  }: {
    agentVaultSessionLogConfigDAL: Pick<
      TAgentVaultSessionLogConfigDALFactory,
      "findOne" | "findByProjectIdFromPrimary"
    >;
  },
  projectId: string,
  { fromPrimary }: { fromPrimary: boolean }
) => {
  const row = fromPrimary
    ? await agentVaultSessionLogConfigDAL.findByProjectIdFromPrimary(projectId)
    : await agentVaultSessionLogConfigDAL.findOne({ projectId });
  return toEffectiveSessionLogConfig(row, isDefaultStorageConfigured());
};

export const toStorageConfig = (storage: TSessionLogStorage): TStorageConfig =>
  storage.type === ObjectStorageType.Default
    ? { storageType: ObjectStorageType.Default }
    : {
        storageType: ObjectStorageType.External,
        appConnectionId: storage.appConnectionId,
        bucket: storage.bucket,
        region: storage.region,
        keyPrefix: storage.keyPrefix,
        projectType: ProjectType.AgentVault
      };

const UNREACHABLE_BUCKET_MESSAGE = (bucket: string) =>
  `Unable to reach bucket '${bucket}'. Check the bucket name, the region, and that the connection's credentials allow s3:ListBucket on it`;

// The message an admin sees for a storage failure, and whether trying again later can help (a 500) or the settings
// need fixing (a 400). Default storage gets the generic message: its bucket belongs to whoever runs the instance, who
// finds the cause in the server logs, and a 5xx tells the proxy to keep the chunk and retry.
export const describeStorageFailure = (error: ObjectStorageError, use: "read" | "check") => {
  if (error.storageType === ObjectStorageType.Default) {
    return { isTemporary: true, message: AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE };
  }

  const { reason, details } = error;
  const bucket = details.bucket ?? "";
  const isTemporary = reason === ObjectStorageErrorReason.Temporary;

  if (reason === ObjectStorageErrorReason.ConnectionInvalid) {
    if (details.isConnectionMissing) {
      return {
        isTemporary,
        message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page."
      };
    }
    if (details.connectionApp) {
      return {
        isTemporary,
        message: `The connection used for session logs is a ${details.connectionApp} connection. Session logs require an AWS connection`
      };
    }
    return {
      isTemporary,
      message: `Couldn't use the AWS connection '${details.connectionName ?? ""}' for session logs: ${details.cause ?? "Infisical could not load its credentials"}`
    };
  }
  if (isTemporary && details.connectionName && !details.awsErrorCode) {
    return {
      isTemporary,
      message: `Couldn't reach AWS to use the connection '${details.connectionName}' for session logs. Try again in a bit.`
    };
  }

  if (use === "check") {
    return {
      isTemporary: false,
      message:
        details.step === "write"
          ? `Bucket '${bucket}' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix`
          : UNREACHABLE_BUCKET_MESSAGE(bucket)
    };
  }

  const code = details.awsErrorCode ?? "";
  let hint = "Check the AWS connection and the bucket settings.";
  if (isTemporary) hint = "S3 isn't responding. Try again in a bit.";
  else if (AWS_CREDENTIAL_ERRORS.has(code)) hint = "Check the AWS connection's credentials.";
  else if (AWS_ACCESS_ERRORS.has(code)) hint = "Check that the connection's credentials allow s3:ListBucket on it.";
  else if (AWS_LOCATION_ERRORS.has(code)) hint = "Check the bucket name and region in Settings.";
  return {
    isTemporary,
    message: `Infisical couldn't list session logs in bucket '${bucket}'${code ? ` (${code})` : ""}. ${hint}`
  };
};

export type TSessionLogEntitlement = "licensed" | "unlicensed" | "unknown";

export type TSessionLogLicenseService = Pick<
  TLicenseServiceFactory,
  "getPlan" | "isServingFallbackPlan" | "getLastKnownPlan"
>;

const hasStorageOnPlan = (
  plan: Pick<TFeatureSet, "agentVaultManagedStorage" | "agentVaultByoS3">,
  type: ObjectStorageType
) => Boolean(type === ObjectStorageType.Default ? plan.agentVaultManagedStorage : plan.agentVaultByoS3);

const FALLBACK_LOG_INTERVAL_MS = 5 * 60_000;
const fallbackLoggedAt = new Map<string, number>();

// Whether the org's plan includes the storage, and the plan that decided it. getPlan answers with the free plan
// while the License Server is down, which would otherwise read as a downgrade and stop recording; "unknown" is a
// fallback with no recent real answer to go on. The free plan includes default storage, so for default storage a
// fallback is always checked: it would otherwise hide a downgrade and tag uploads with the wrong retention.
export const getSessionLogEntitlement = async (
  licenseService: TSessionLogLicenseService,
  orgId: string,
  storageType: ObjectStorageType
): Promise<{
  entitlement: TSessionLogEntitlement;
  plan: Pick<TFeatureSet, "agentVaultSessionLogRetentionDays"> | null;
}> => {
  const plan = await licenseService.getPlan(orgId);
  const isOnPlan = hasStorageOnPlan(plan, storageType);
  if (isOnPlan && storageType !== ObjectStorageType.Default) return { entitlement: "licensed", plan };
  if (!(await licenseService.isServingFallbackPlan(orgId))) {
    return { entitlement: isOnPlan ? "licensed" : "unlicensed", plan };
  }

  const lastKnown = await licenseService.getLastKnownPlan(orgId);
  // Retention comes from the last real plan for as long as it is cached, even past the hour the yes or no decision
  // trusts it: the tag is fixed at upload, so the stand-in plan's 30 days would delete a longer plan's logs early.
  let decision: Awaited<ReturnType<typeof getSessionLogEntitlement>> = isOnPlan
    ? { entitlement: "licensed", plan: lastKnown?.plan ?? plan }
    : { entitlement: "unknown", plan: lastKnown?.plan ?? null };
  if (lastKnown && Date.now() - lastKnown.fetchedAt <= AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS) {
    decision = {
      entitlement: hasStorageOnPlan(lastKnown.plan, storageType) ? "licensed" : "unlicensed",
      plan: lastKnown.plan
    };
  }

  const now = Date.now();
  if (now - (fallbackLoggedAt.get(orgId) ?? 0) >= FALLBACK_LOG_INTERVAL_MS) {
    fallbackLoggedAt.set(orgId, now);
    logger.warn(
      `agentVaultSessionLog: the plan is a License Server fallback, deciding session logs from the last known plan [orgId=${orgId}] [storageType=${storageType}] [entitlement=${decision.entitlement}] [lastKnownAgeMs=${lastKnown ? now - lastKnown.fetchedAt : "none"}]`
    );
  }
  return decision;
};

// A v2 entitlement of null would mean "no limit" elsewhere, but a lifecycle rule needs a number, so it means the
// default here.
export const getSessionLogRetentionDays = (plan: Pick<TFeatureSet, "agentVaultSessionLogRetentionDays"> | null) =>
  plan?.agentVaultSessionLogRetentionDays ?? AGENT_VAULT_SESSION_LOG_DEFAULT_RETENTION_DAYS;

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
