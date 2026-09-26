import { z } from "zod";

import { TAgentVaultSessionLogConfigs } from "@app/db/schemas";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX } from "./agent-vault-session-log-constants";
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
