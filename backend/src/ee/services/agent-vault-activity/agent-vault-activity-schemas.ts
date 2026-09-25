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
import { normalizeKeyPrefix } from "./agent-vault-activity-storage";

const BUCKET_NAME_RULE =
  "Must be 3 to 63 characters: lowercase letters, numbers, dots and hyphens, starting and ending with a letter or number";

const KEY_PREFIX_LENGTH_RULE = `May be at most ${AGENT_VAULT_ACTIVITY_MAX_KEY_PREFIX_LENGTH} characters, including the trailing slash`;

const IvSchema = z
  .string()
  .regex(/^[A-Za-z0-9+/]{16}$/, "Must be 12 bytes of unpadded base64")
  .describe(AGENT_VAULT.ACTIVITY.iv);

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
  iv: IvSchema
});

export const AgentVaultActivityChunkCreateResponseSchema = z.object({
  chunkId: z.string().describe(AGENT_VAULT.ACTIVITY.chunkId),
  uploadUrl: z.string().describe(AGENT_VAULT.ACTIVITY.uploadUrl),
  expiresInSeconds: z.number().describe(AGENT_VAULT.ACTIVITY.expiresInSeconds)
});

export const AgentVaultActivityQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(AGENT_VAULT_ACTIVITY_MAX_PAGE_RECORDS)
    .default(AGENT_VAULT_ACTIVITY_DEFAULT_PAGE_RECORDS)
    .describe(AGENT_VAULT.ACTIVITY.limit),
  before: z.string().ulid().optional().describe(AGENT_VAULT.ACTIVITY.before),
  from: z.coerce.date().optional().describe(AGENT_VAULT.ACTIVITY.from),
  to: z.coerce.date().optional().describe(AGENT_VAULT.ACTIVITY.to),
  receivedAfter: z.coerce.date().optional().describe(AGENT_VAULT.ACTIVITY.receivedAfter)
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
  configVersion: z.number().describe(AGENT_VAULT.ACTIVITY.configVersion),
  ciphertextBytes: z.number().describe(AGENT_VAULT.ACTIVITY.ciphertextBytes),
  iv: z.string().describe(AGENT_VAULT.ACTIVITY.iv),
  presignedGetUrl: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.presignedGetUrl)
});

export const AgentVaultActivityResponseSchema = z.object({
  enabled: z.boolean().describe(AGENT_VAULT.ACTIVITY.enabled),
  sessionKey: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.sessionKey),
  projectId: z.string().describe("The project the session belongs to. Part of the decryption context."),
  configVersion: z.number().describe(AGENT_VAULT.ACTIVITY.configVersion),
  chunks: AgentVaultActivityChunkViewSchema.array(),
  nextCursor: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.nextCursor),
  hasMore: z.boolean().describe(AGENT_VAULT.ACTIVITY.hasMore),
  nextReceivedAfter: z.date().describe(AGENT_VAULT.ACTIVITY.nextReceivedAfter),
  storageUnavailable: z
    .object({
      reason: z
        .nativeEnum(AgentVaultActivityStorageUnavailableReason)
        .describe(AGENT_VAULT.ACTIVITY.storageUnavailableReason),
      message: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.storageUnavailableMessage)
    })
    .nullable()
    .describe(AGENT_VAULT.ACTIVITY.storageUnavailable)
});

export const AgentVaultActivityConfigViewSchema = z.object({
  enabled: z.boolean().describe(AGENT_VAULT.ACTIVITY.configEnabled),
  appConnectionId: z.string().uuid().nullable().describe(AGENT_VAULT.ACTIVITY.appConnectionId),
  bucket: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.bucket),
  region: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.region),
  keyPrefix: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.keyPrefix),
  configVersion: z.number().describe(AGENT_VAULT.ACTIVITY.configVersion)
});

export const AgentVaultActivityConfigResponseSchema = z.object({
  config: AgentVaultActivityConfigViewSchema,
  isStorageFull: z.boolean().describe(AGENT_VAULT.ACTIVITY.isStorageFull),
  corsProbeUrl: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.corsProbeUrl),
  connectionError: z.string().nullable().describe(AGENT_VAULT.ACTIVITY.connectionError)
});

export const AgentVaultActivityConfigUpdateSchema = z
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
