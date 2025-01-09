import { z } from "zod";

import { SecretSyncsSchema } from "@app/db/schemas/secret-syncs";
import { SecretSyncs } from "@app/lib/api-docs";
import { slugSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

const SyncOptionsSchema = z.object({
  prependPrefix: z
    .string()
    .trim()
    .transform((str) => str.toUpperCase())
    .optional()
    .describe(SecretSyncs.SYNC_OPTIONS.PREPEND_PREFIX),
  appendSuffix: z
    .string()
    .trim()
    .transform((str) => str.toUpperCase())
    .optional()
    .describe(SecretSyncs.SYNC_OPTIONS.APPEND_SUFFIX)
});

export const BaseSecretSyncSchema = (app: AppConnection) =>
  SecretSyncsSchema.omit({
    destination: true,
    destinationConfig: true,
    syncOptions: true
  }).extend({
    syncOptions: SyncOptionsSchema,
    // join properties
    projectId: z.string(),
    connection: z.object({ app: z.literal(app), name: z.string(), id: z.string().uuid() }),
    environment: z.object({ slug: z.string(), name: z.string(), id: z.string().uuid() }),
    folder: z.object({ id: z.string(), path: z.string() })
  });

export const GenericCreateSecretSyncFieldsSchema = (sync: SecretSync) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretSyncs.CREATE(sync).name),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.CREATE(sync).description),
    connectionId: z.string().uuid().describe(SecretSyncs.CREATE(sync).connectionId),
    folderId: z.string().uuid().describe(SecretSyncs.CREATE(sync).folderId),
    isEnabled: z.boolean().default(true).describe(SecretSyncs.CREATE(sync).isEnabled),
    syncOptions: SyncOptionsSchema.optional().default({}).describe(SecretSyncs.CREATE(sync).syncOptions)
  });

export const GenericUpdateSecretSyncFieldsSchema = (sync: SecretSync) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretSyncs.UPDATE(sync).name).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.UPDATE(sync).description),
    folderId: z.string().uuid().optional().describe(SecretSyncs.UPDATE(sync).folderId),
    isEnabled: z.boolean().optional().describe(SecretSyncs.UPDATE(sync).isEnabled),
    syncOptions: SyncOptionsSchema.optional().describe(SecretSyncs.UPDATE(sync).syncOptions)
  });
