import { z } from "zod";

import { TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { logger } from "@app/lib/logger";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX,
  AGENT_VAULT_SESSION_LOG_LAST_KNOWN_PLAN_MAX_AGE_MS
} from "./agent-vault-session-log-constants";
import { TResolvedSessionLogStorageConfig } from "./agent-vault-session-log-types";

export const withKeyPrefix = (keyPrefix: string | null | undefined, key: string) =>
  keyPrefix ? `${keyPrefix}/${key}` : key;

export const buildSessionLogObjectKey = ({
  keyPrefix,
  projectId,
  sessionId,
  proxyId,
  startedAt,
  chunkId
}: {
  keyPrefix?: string | null;
  projectId: string;
  sessionId: string;
  proxyId: string;
  startedAt: Date;
  chunkId: string;
}) => {
  const day = startedAt.toISOString().slice(0, 10);
  return withKeyPrefix(keyPrefix, `${projectId}/${sessionId}/${proxyId}/${day}/${chunkId}.json.enc`);
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

const CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 256;

const HistoryCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("h"),
  id: z.string().regex(AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX)
});

const TailCursorPayloadSchema = z.object({
  v: z.literal(CURSOR_VERSION),
  m: z.literal("t"),
  at: z.string().datetime()
});

const encode = (payload: object) => Buffer.from(JSON.stringify(payload)).toString("base64url");

const decode = (cursor: string): unknown => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    return undefined;
  }
};

export const encodeHistoryCursor = (chunkId: string) => encode({ v: CURSOR_VERSION, m: "h", id: chunkId });

export const encodeTailCursor = (at: Date) => encode({ v: CURSOR_VERSION, m: "t", at: at.toISOString() });

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
    return parsed.data.id;
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
            : "Invalid cursor. Pass the liveCursor or nextCursor of a previous response unchanged"
      });
      return z.NEVER;
    }
    return new Date(parsed.data.at);
  });
