import { z } from "zod";

import { AGENT_VAULT } from "@app/lib/api-docs";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { keyPrefixSchema, s3BucketNameSchema } from "@app/services/object-storage/object-storage-path-fns";
import { ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import {
  AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES,
  AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS,
  AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES
} from "./agent-vault-session-log-constants";
import { HistoryCursorSchema, TailCursorSchema } from "./agent-vault-session-log-cursor-fns";

const CiphertextSha256Schema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}$/, "Must be a SHA-256 digest as unpadded base64")
  .describe(AGENT_VAULT.SESSION_LOGS.ciphertextSha256);

export const AgentVaultSessionLogChunkCreateSchema = z.object({
  chunkId: z
    .string()
    .regex(AGENT_VAULT_SESSION_LOG_CHUNK_ID_REGEX, "Must be a lowercase UUIDv7")
    .describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  endedAt: z.coerce.date().describe(AGENT_VAULT.SESSION_LOGS.endedAt),
  ciphertextBytes: z
    .number()
    .int()
    .min(AGENT_VAULT_SESSION_LOG_MIN_CHUNK_BYTES)
    .max(AGENT_VAULT_SESSION_LOG_MAX_CHUNK_BYTES)
    .describe(AGENT_VAULT.SESSION_LOGS.ciphertextBytes),
  ciphertextSha256: CiphertextSha256Schema,
  recordCount: z
    .number()
    .int()
    .min(1)
    .max(AGENT_VAULT_SESSION_LOG_MAX_CHUNK_RECORDS)
    .optional()
    .describe(AGENT_VAULT.SESSION_LOGS.recordCount),
  iv: z.string().max(64).optional().describe(AGENT_VAULT.SESSION_LOGS.legacyIv)
});

export const AgentVaultSessionLogChunkCreateResponseSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  uploadUrl: z.string().describe(AGENT_VAULT.SESSION_LOGS.uploadUrl),
  expiresInSeconds: z.number().describe(AGENT_VAULT.SESSION_LOGS.expiresInSeconds)
});

export const AgentVaultSessionLogHistoryQuerySchema = z.object({
  cursor: HistoryCursorSchema.optional().describe(AGENT_VAULT.SESSION_LOGS.historyCursor),
  from: z.coerce.date().optional().describe(AGENT_VAULT.SESSION_LOGS.from),
  to: z.coerce.date().optional().describe(AGENT_VAULT.SESSION_LOGS.to)
});

export const AgentVaultSessionLogTailQuerySchema = z.object({
  cursor: TailCursorSchema.optional().describe(AGENT_VAULT.SESSION_LOGS.tailCursor)
});

export const AgentVaultSessionLogChunkViewSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.SESSION_LOGS.chunkId),
  proxyId: z.string().describe(AGENT_VAULT.SESSION_LOGS.proxyId),
  ciphertextBytes: z.number().describe(AGENT_VAULT.SESSION_LOGS.ciphertextBytes),
  presignedGetUrl: z.string().describe(AGENT_VAULT.SESSION_LOGS.presignedGetUrl)
});

const AgentVaultSessionLogDisabledReasonSchema = z.enum(["off", "not-on-plan"]);
export type TAgentVaultSessionLogDisabledReason = z.infer<typeof AgentVaultSessionLogDisabledReasonSchema>;

const AgentVaultSessionLogSchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.enabled),
    isRecordable: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.isRecordable),
    sessionKey: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.sessionKey),
    disabledReason: AgentVaultSessionLogDisabledReasonSchema.nullable().describe(
      AGENT_VAULT.SESSION_LOGS.disabledReason
    ),
    storageType: z.nativeEnum(ObjectStorageType).nullable().describe(AGENT_VAULT.SESSION_LOGS.storageType)
  })
  .describe(AGENT_VAULT.SESSION_LOGS.sessionLogs);

export const AgentVaultSessionLogHistoryResponseSchema = z.object({
  sessionLogs: AgentVaultSessionLogSchema,
  chunks: AgentVaultSessionLogChunkViewSchema.array(),
  nextCursor: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.historyNextCursor)
});

export const AgentVaultSessionLogTailResponseSchema = z.object({
  sessionLogs: AgentVaultSessionLogSchema,
  chunks: AgentVaultSessionLogChunkViewSchema.array(),
  nextCursor: z.string().describe(AGENT_VAULT.SESSION_LOGS.tailNextCursor)
});

const DefaultStorageSchema = z
  .object({ type: z.literal(ObjectStorageType.Default) })
  .strict()
  .describe(JSON.stringify({ title: "Default Storage" }));

const ExternalStorageSchema = z
  .object({
    type: z.literal(ObjectStorageType.External),
    appConnectionId: z.string().uuid().describe(AGENT_VAULT.SESSION_LOGS.appConnectionId),
    bucket: s3BucketNameSchema.describe(AGENT_VAULT.SESSION_LOGS.bucket),
    region: z.nativeEnum(AWSRegion).describe(AGENT_VAULT.SESSION_LOGS.region),
    keyPrefix: keyPrefixSchema(256).optional().describe(AGENT_VAULT.SESSION_LOGS.keyPrefix)
  })
  .strict()
  .describe(JSON.stringify({ title: "External Storage" }));

const AgentVaultSessionLogStorageSchema = z
  .discriminatedUnion("type", [DefaultStorageSchema, ExternalStorageSchema])
  .describe(AGENT_VAULT.SESSION_LOGS.storage);

const AgentVaultSessionLogStorageViewSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal(ObjectStorageType.Default) }).describe(JSON.stringify({ title: "Default Storage" })),
    z
      .object({
        type: z.literal(ObjectStorageType.External),
        appConnectionId: z.string().uuid().describe(AGENT_VAULT.SESSION_LOGS.appConnectionId),
        bucket: z.string().describe(AGENT_VAULT.SESSION_LOGS.bucket),
        region: z.string().describe(AGENT_VAULT.SESSION_LOGS.region),
        keyPrefix: z.string().nullable().describe(AGENT_VAULT.SESSION_LOGS.keyPrefix)
      })
      .describe(JSON.stringify({ title: "External Storage" }))
  ])
  .describe(AGENT_VAULT.SESSION_LOGS.storage);

export const AgentVaultSessionLogSettingsSchema = z.object({
  enabled: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.configEnabled),
  storage: AgentVaultSessionLogStorageViewSchema
});

export const AgentVaultSessionLogSettingsResponseSchema = z.object({
  settings: AgentVaultSessionLogSettingsSchema.nullable(),
  defaultStorage: z.object({
    configured: z.boolean().describe(AGENT_VAULT.SESSION_LOGS.defaultStorageConfigured)
  })
});

export const AgentVaultSessionLogHealthResponseSchema = z.object({
  health: z.object({
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

export const AgentVaultSessionLogSettingsUpdateSchema = z.discriminatedUnion("enabled", [
  z
    .object({ enabled: z.literal(false).describe(AGENT_VAULT.SESSION_LOGS.configEnabled) })
    .strict()
    .describe(JSON.stringify({ title: "Turn Off" })),
  z
    .object({
      enabled: z.literal(true).describe(AGENT_VAULT.SESSION_LOGS.configEnabled),
      storage: AgentVaultSessionLogStorageSchema
    })
    .strict()
    .describe(JSON.stringify({ title: "Turn On" }))
]);
