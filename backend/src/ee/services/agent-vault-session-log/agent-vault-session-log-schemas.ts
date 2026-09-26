import { z } from "zod";

import { AGENT_VAULT } from "@app/lib/api-docs";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import {
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX,
  AGENT_VAULT_SESSION_LOG_DEFAULT_PAGE_RECORDS,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS,
  AGENT_VAULT_SESSION_LOG_MAX_KEY_PREFIX_LENGTH,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_RECORDS,
  AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES
} from "./agent-vault-session-log-constants";
import { AgentVaultSessionLogStorageUnavailableReason } from "./agent-vault-session-log-enums";
import { HistoryCursorSchema, TailCursorSchema } from "./agent-vault-session-log-fns";

const BUCKET_NAME_RULE =
  "Must be 3 to 63 characters: lowercase letters, numbers, dots and hyphens, starting and ending with a letter or number";

const IvSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{16}$/, "Must be 12 bytes of unpadded base64")
  .describe(AGENT_VAULT.SESSION_LOGS.iv);

const CiphertextSha256Schema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}$/, "Must be a SHA-256 digest as unpadded base64")
  .describe(AGENT_VAULT.SESSION_LOGS.ciphertextSha256);

export const AgentVaultSessionLogChunkCreateSchema = z.object({
  chunkId: z
    .string()
    .regex(AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX, "Must be a lowercase UUIDv7")
    .describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  startedAt: z.coerce.date().describe(AGENT_VAULT.SESSION_LOGS.startedAt),
  endedAt: z.coerce.date().describe(AGENT_VAULT.SESSION_LOGS.endedAt),
  firstSeq: z.number().int().min(0).safe().describe(AGENT_VAULT.SESSION_LOGS.firstSeq),
  lastSeq: z.number().int().min(0).safe().describe(AGENT_VAULT.SESSION_LOGS.lastSeq),
  recordCount: z
    .number()
    .int()
    .min(1)
    .max(AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS)
    .describe(AGENT_VAULT.SESSION_LOGS.recordCount),
  droppedCount: z.number().int().min(0).safe().describe(AGENT_VAULT.SESSION_LOGS.droppedCount),
  ciphertextBytes: z
    .number()
    .int()
    .min(AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES)
    .max(AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES)
    .describe(AGENT_VAULT.SESSION_LOGS.ciphertextBytes),
  iv: IvSchema,
  ciphertextSha256: CiphertextSha256Schema
});

export const AgentVaultSessionLogChunkCreateResponseSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  uploadUrl: z.string().describe(AGENT_VAULT.SESSION_LOGS.uploadUrl),
  expiresInSeconds: z.number().describe(AGENT_VAULT.SESSION_LOGS.expiresInSeconds)
});

const SessionLogLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(AGENT_VAULT_SESSION_LOG_MAX_PAGE_RECORDS)
  .default(AGENT_VAULT_SESSION_LOG_DEFAULT_PAGE_RECORDS)
  .describe(AGENT_VAULT.SESSION_LOGS.limit);

export const AgentVaultSessionLogHistoryQuerySchema = z.object({
  limit: SessionLogLimitSchema,
  cursor: HistoryCursorSchema.optional().describe(AGENT_VAULT.SESSION_LOGS.historyCursor),
  from: z.coerce.date().optional().describe(AGENT_VAULT.SESSION_LOGS.from),
  to: z.coerce.date().optional().describe(AGENT_VAULT.SESSION_LOGS.to)
});

export const AgentVaultSessionLogTailQuerySchema = z.object({
  limit: SessionLogLimitSchema,
  cursor: TailCursorSchema.optional().describe(AGENT_VAULT.SESSION_LOGS.tailCursor)
});

export const AgentVaultSessionLogChunkViewSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  proxyId: z.string().describe(AGENT_VAULT.SESSION_LOGS.proxyId),
  proxyName: z.string().describe(AGENT_VAULT.SESSION_LOGS.proxyName),
  startedAt: z.date().describe(AGENT_VAULT.SESSION_LOGS.startedAt),
  endedAt: z.date().describe(AGENT_VAULT.SESSION_LOGS.endedAt),
  firstSeq: z.number().describe(AGENT_VAULT.SESSION_LOGS.firstSeq),
  lastSeq: z.number().describe(AGENT_VAULT.SESSION_LOGS.lastSeq),
  recordCount: z.number().describe(AGENT_VAULT.SESSION_LOGS.recordCount),
  droppedCount: z.number().describe(AGENT_VAULT.SESSION_LOGS.droppedCount),
  ciphertextBytes: z.number().describe(AGENT_VAULT.SESSION_LOGS.ciphertextBytes),
  iv: z.string().describe(AGENT_VAULT.SESSION_LOGS.iv),
  ciphertextSha256: z.string().describe(AGENT_VAULT.SESSION_LOGS.ciphertextSha256),
  presignedGetUrl: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.presignedGetUrl)
});

const AgentVaultSessionLogSchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.enabled),
    sessionKey: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.sessionKey),
    storageUnavailable: z
      .object({
        reason: z
          .nativeEnum(AgentVaultSessionLogStorageUnavailableReason)
          .describe(AGENT_VAULT.SESSION_LOGS.storageUnavailableReason),
        message: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.storageUnavailableMessage)
      })
      .nullable()
      .describe(AGENT_VAULT.SESSION_LOGS.storageUnavailable)
  })
  .describe(AGENT_VAULT.SESSION_LOGS.sessionLogs);

export const AgentVaultSessionLogHistoryResponseSchema = z.object({
  sessionLogs: AgentVaultSessionLogSchema,
  chunks: AgentVaultSessionLogChunkViewSchema.array(),
  nextCursor: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.historyNextCursor),
  liveCursor: z.string().describe(AGENT_VAULT.SESSION_LOGS.liveCursor)
});

export const AgentVaultSessionLogTailResponseSchema = z.object({
  sessionLogs: AgentVaultSessionLogSchema,
  chunks: AgentVaultSessionLogChunkViewSchema.array(),
  nextCursor: z.string().describe(AGENT_VAULT.SESSION_LOGS.tailNextCursor),
  hasMore: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.tailHasMore)
});

export const AgentVaultSessionLogSettingsSchema = z.object({
  enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.configEnabled),
  appConnectionId: z.string().uuid().nullable().describe(AGENT_VAULT.SESSION_LOGS.appConnectionId),
  bucket: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.bucket),
  region: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.region),
  keyPrefix: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.keyPrefix)
});

export const AgentVaultSessionLogSettingsResponseSchema = z.object({
  settings: AgentVaultSessionLogSettingsSchema
});

export const AgentVaultSessionLogHealthResponseSchema = z.object({
  health: z.object({
    isStorageFull: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.isStorageFull),
    connectionError: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.connectionError)
  })
});

export const AgentVaultSessionLogCorsProbeResponseSchema = z.object({
  probe: z
    .object({
      url: z.string().describe(AGENT_VAULT.SESSION_LOGS.corsProbeUrl),
      expiresInSeconds: z.number().describe(AGENT_VAULT.SESSION_LOGS.expiresInSeconds)
    })
    .nullable()
});

export const AgentVaultSessionLogSettingsUpdateSchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.configEnabled),
    appConnectionId: z.string().uuid().nullable().describe(AGENT_VAULT.SESSION_LOGS.appConnectionId),
    bucket: z
      .string()
      .trim()
      .max(63, BUCKET_NAME_RULE)
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, BUCKET_NAME_RULE)
      .describe(AGENT_VAULT.SESSION_LOGS.bucket),
    region: z.nativeEnum(AWSRegion).describe(AGENT_VAULT.SESSION_LOGS.region),
    keyPrefix: z
      .string()
      .trim()
      .max(
        AGENT_VAULT_SESSION_LOG_MAX_KEY_PREFIX_LENGTH,
        `May be at most ${AGENT_VAULT_SESSION_LOG_MAX_KEY_PREFIX_LENGTH} characters`
      )
      .regex(/^[A-Za-z0-9!\-_.'()/]*$/, "May only contain letters, numbers and ! - _ . ' ( ) /")
      .refine(
        (v) => v === "" || v.split("/").every(Boolean),
        "Must be folder names separated by single slashes, with no slash at the start or end, like 'logs/agent-vault'"
      )
      .refine(
        (v) => !v.split("/").some((folder) => folder === "." || folder === ".."),
        "May not use '.' or '..' as a folder name"
      )
      .describe(AGENT_VAULT.SESSION_LOGS.keyPrefix)
  })
  .partial();
