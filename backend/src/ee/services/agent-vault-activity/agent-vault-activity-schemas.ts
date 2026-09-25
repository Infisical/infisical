import { z } from "zod";

import { AGENT_VAULT } from "@app/lib/api-docs";
import { AWSRegion } from "@app/services/app-connection/app-connection-enums";

import { hasTraversalSegment } from "../agent-vault/agent-vault-path-prefix";
import {
  AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_RECORDS,
  AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES,
  AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS,
  AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_INPUT_LENGTH,
  AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH,
  AGENT_VAULT_ACTIVITY_MAX_PAGE_RECORDS,
  AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES,
  AgentVaultActivityStorageUnavailableReason
} from "./agent-vault-activity-constants";
import { HistoryCursorSchema, TailCursorSchema } from "./agent-vault-activity-cursor";
import { normalizeKeyPrefix } from "./agent-vault-activity-storage";

const BUCKET_NAME_RULE =
  "Must be 3 to 63 characters: lowercase letters, numbers, dots and hyphens, starting and ending with a letter or number";

const KEY_PREFIX_LENGTH_RULE = `May be at most ${AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH} characters, including the trailing slash`;

const IvSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{16}$/, "Must be 12 bytes of unpadded base64")
  .describe(AGENT_VAULT.ACTIVITY.iv);

const CiphertextSha256Schema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{43}$/, "Must be a SHA-256 digest as unpadded base64")
  .describe(AGENT_VAULT.ACTIVITY.ciphertextSha256);

export const AgentVaultActivityChunkCreateSchema = z.object({
  chunkId: z.string().ulid().describe(AGENT_VAULT.ACTIVITY.chunkId),
  startedAt: z.coerce.date().describe(AGENT_VAULT.ACTIVITY.startedAt),
  endedAt: z.coerce.date().describe(AGENT_VAULT.ACTIVITY.endedAt),
  firstSeq: z.number().int().min(0).safe().describe(AGENT_VAULT.ACTIVITY.firstSeq),
  lastSeq: z.number().int().min(0).safe().describe(AGENT_VAULT.ACTIVITY.lastSeq),
  recordCount: z
    .number()
    .int()
    .min(1)
    .max(AGENT_VAULT_ACTIVITY_MAX_CHUNK_RECORDS)
    .describe(AGENT_VAULT.ACTIVITY.recordCount),
  droppedCount: z.number().int().min(0).safe().describe(AGENT_VAULT.ACTIVITY.droppedCount),
  ciphertextBytes: z
    .number()
    .int()
    .min(AGENT_VAULT_ACTIVITY_MIN_CHUNK_BYTES)
    .max(AGENT_VAULT_ACTIVITY_MAX_CHUNK_BYTES)
    .describe(AGENT_VAULT.ACTIVITY.ciphertextBytes),
  iv: IvSchema,
  ciphertextSha256: CiphertextSha256Schema
});

export const AgentVaultActivityChunkCreateResponseSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.ACTIVITY.chunkId),
  uploadUrl: z.string().describe(AGENT_VAULT.ACTIVITY.uploadUrl),
  expiresInSeconds: z.number().describe(AGENT_VAULT.ACTIVITY.expiresInSeconds)
});

const ActivityLimitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(AGENT_VAULT_ACTIVITY_MAX_PAGE_RECORDS)
  .default(AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_RECORDS)
  .describe(AGENT_VAULT.ACTIVITY.limit);

export const AgentVaultActivityHistoryQuerySchema = z.object({
  limit: ActivityLimitSchema,
  cursor: HistoryCursorSchema.optional().describe(AGENT_VAULT.ACTIVITY.historyCursor),
  from: z.coerce.date().optional().describe(AGENT_VAULT.ACTIVITY.from),
  to: z.coerce.date().optional().describe(AGENT_VAULT.ACTIVITY.to)
});

export const AgentVaultActivityTailQuerySchema = z.object({
  limit: ActivityLimitSchema,
  cursor: TailCursorSchema.optional().describe(AGENT_VAULT.ACTIVITY.tailCursor)
});

export const AgentVaultActivityChunkViewSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.ACTIVITY.chunkId),
  proxyId: z.string().describe(AGENT_VAULT.ACTIVITY.proxyId),
  proxyName: z.string().describe(AGENT_VAULT.ACTIVITY.proxyName),
  startedAt: z.date().describe(AGENT_VAULT.ACTIVITY.startedAt),
  endedAt: z.date().describe(AGENT_VAULT.ACTIVITY.endedAt),
  firstSeq: z.number().describe(AGENT_VAULT.ACTIVITY.firstSeq),
  lastSeq: z.number().describe(AGENT_VAULT.ACTIVITY.lastSeq),
  recordCount: z.number().describe(AGENT_VAULT.ACTIVITY.recordCount),
  droppedCount: z.number().describe(AGENT_VAULT.ACTIVITY.droppedCount),
  ciphertextBytes: z.number().describe(AGENT_VAULT.ACTIVITY.ciphertextBytes),
  iv: z.string().describe(AGENT_VAULT.ACTIVITY.iv),
  ciphertextSha256: z.string().describe(AGENT_VAULT.ACTIVITY.ciphertextSha256),
  presignedGetUrl: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.presignedGetUrl)
});

const AgentVaultActivitySchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.ACTIVITY.enabled),
    sessionKey: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.sessionKey),
    projectId: z.string().describe(AGENT_VAULT.ACTIVITY.projectId),
    storageUnavailable: z
      .object({
        reason: z
          .nativeEnum(AgentVaultActivityStorageUnavailableReason)
          .describe(AGENT_VAULT.ACTIVITY.storageUnavailableReason),
        message: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.storageUnavailableMessage)
      })
      .nullable()
      .describe(AGENT_VAULT.ACTIVITY.storageUnavailable)
  })
  .describe(AGENT_VAULT.ACTIVITY.activity);

export const AgentVaultActivityHistoryResponseSchema = z.object({
  activity: AgentVaultActivitySchema,
  chunks: AgentVaultActivityChunkViewSchema.array(),
  nextCursor: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.historyNextCursor),
  liveCursor: z.string().describe(AGENT_VAULT.ACTIVITY.liveCursor)
});

export const AgentVaultActivityTailResponseSchema = z.object({
  activity: AgentVaultActivitySchema,
  chunks: AgentVaultActivityChunkViewSchema.array(),
  nextCursor: z.string().describe(AGENT_VAULT.ACTIVITY.tailNextCursor),
  hasMore: z.boolean().describe(AGENT_VAULT.ACTIVITY.tailHasMore)
});

export const AgentVaultActivityLoggingSettingsSchema = z.object({
  enabled: z.boolean().describe(AGENT_VAULT.ACTIVITY.configEnabled),
  appConnectionId: z.string().uuid().nullable().describe(AGENT_VAULT.ACTIVITY.appConnectionId),
  bucket: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.bucket),
  region: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.region),
  keyPrefix: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.keyPrefix)
});

export const AgentVaultActivityLoggingSettingsResponseSchema = z.object({
  settings: AgentVaultActivityLoggingSettingsSchema
});

export const AgentVaultActivityLoggingHealthResponseSchema = z.object({
  health: z.object({
    isStorageFull: z.boolean().describe(AGENT_VAULT.ACTIVITY.isStorageFull),
    connectionError: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.connectionError)
  })
});

export const AgentVaultActivityLoggingCorsProbeResponseSchema = z.object({
  probe: z
    .object({
      url: z.string().describe(AGENT_VAULT.ACTIVITY.corsProbeUrl),
      expiresInSeconds: z.number().describe(AGENT_VAULT.ACTIVITY.expiresInSeconds)
    })
    .nullable()
});

export const AgentVaultActivityLoggingSettingsUpdateSchema = z
  .object({
    enabled: z.boolean().describe(AGENT_VAULT.ACTIVITY.configEnabled),
    appConnectionId: z.string().uuid().nullable().describe(AGENT_VAULT.ACTIVITY.appConnectionId),
    bucket: z
      .string()
      .trim()
      .max(63, BUCKET_NAME_RULE)
      .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, BUCKET_NAME_RULE)
      .describe(AGENT_VAULT.ACTIVITY.bucket),
    region: z.nativeEnum(AWSRegion).describe(AGENT_VAULT.ACTIVITY.region),
    keyPrefix: z
      .string()
      .trim()
      .max(AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_INPUT_LENGTH, KEY_PREFIX_LENGTH_RULE)
      .regex(/^[A-Za-z0-9!\-_.'()/]*$/, "May only contain letters, numbers and ! - _ . ' ( ) /")
      .refine((v) => !hasTraversalSegment(v), "May not use '.' or '..' as a folder name")
      .refine((v) => normalizeKeyPrefix(v).length <= AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH, KEY_PREFIX_LENGTH_RULE)
      .describe(AGENT_VAULT.ACTIVITY.keyPrefix)
  })
  .partial();
