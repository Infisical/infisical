import { z } from "zod";

import { SecretSyncsSchema } from "@app/db/schemas/secret-syncs";
import { SecretSyncs } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { slugSchema } from "@app/server/lib/schemas";
import { SecretSync, SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_CONNECTION_MAP } from "@app/services/secret-sync/secret-sync-maps";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const SyncOptionsSchema = (secretSync: SecretSync, options: TSyncOptionsConfig = { canImportSecrets: true }) =>
  z.object({
    initialSyncBehavior: (options.canImportSecrets
      ? z.nativeEnum(SecretSyncInitialSyncBehavior)
      : z.literal(SecretSyncInitialSyncBehavior.OverwriteDestination)
    ).describe(SecretSyncs.SYNC_OPTIONS(secretSync).INITIAL_SYNC_BEHAVIOR)
    // prependPrefix: z
    //   .string()
    //   .trim()
    //   .transform((str) => str.toUpperCase())
    //   .optional()
    //   .describe(SecretSyncs.SYNC_OPTIONS(secretSync).PREPEND_PREFIX),
    // appendSuffix: z
    //   .string()
    //   .trim()
    //   .transform((str) => str.toUpperCase())
    //   .optional()
    //   .describe(SecretSyncs.SYNC_OPTIONS(secretSync).APPEND_SUFFIX)
  });

export const BaseSecretSyncSchema = (destination: SecretSync, syncOptionsConfig?: TSyncOptionsConfig) =>
  SecretSyncsSchema.omit({
    destination: true,
    destinationConfig: true,
    syncOptions: true
  }).extend({
    // destination needs to be on the extended object for type differentiation
    syncOptions: SyncOptionsSchema(destination, syncOptionsConfig),
    // join properties
    projectId: z.string(),
    connection: z.object({
      app: z.literal(SECRET_SYNC_CONNECTION_MAP[destination]),
      name: z.string(),
      id: z.string().uuid()
    }),
    environment: z.object({ slug: z.string(), name: z.string(), id: z.string().uuid() }).nullable(),
    folder: z.object({ id: z.string(), path: z.string() }).nullable()
  });

export const GenericCreateSecretSyncFieldsSchema = (destination: SecretSync, syncOptionsConfig?: TSyncOptionsConfig) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretSyncs.CREATE(destination).name),
    projectId: z.string().trim().min(1, "Project ID required").describe(SecretSyncs.CREATE(destination).projectId),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.CREATE(destination).description),
    connectionId: z.string().uuid().describe(SecretSyncs.CREATE(destination).connectionId),
    environment: slugSchema({ field: "environment", max: 64 }).describe(SecretSyncs.CREATE(destination).environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Secret path required")
      .transform(removeTrailingSlash)
      .describe(SecretSyncs.CREATE(destination).secretPath),
    isAutoSyncEnabled: z.boolean().default(true).describe(SecretSyncs.CREATE(destination).isAutoSyncEnabled),
    syncOptions: SyncOptionsSchema(destination, syncOptionsConfig).describe(SecretSyncs.CREATE(destination).syncOptions)
  });

export const GenericUpdateSecretSyncFieldsSchema = (destination: SecretSync, syncOptionsConfig?: TSyncOptionsConfig) =>
  z.object({
    name: slugSchema({ field: "name" }).describe(SecretSyncs.UPDATE(destination).name).optional(),
    connectionId: z.string().uuid().describe(SecretSyncs.UPDATE(destination).connectionId).optional(),
    description: z
      .string()
      .trim()
      .max(256, "Description cannot exceed 256 characters")
      .nullish()
      .describe(SecretSyncs.UPDATE(destination).description),
    environment: slugSchema({ field: "environment", max: 64 })
      .optional()
      .describe(SecretSyncs.UPDATE(destination).environment),
    secretPath: z
      .string()
      .trim()
      .min(1, "Invalid secret path")
      .transform(removeTrailingSlash)
      .optional()
      .describe(SecretSyncs.UPDATE(destination).secretPath),
    isAutoSyncEnabled: z.boolean().optional().describe(SecretSyncs.UPDATE(destination).isAutoSyncEnabled),
    syncOptions: SyncOptionsSchema(destination, syncOptionsConfig)
      .optional()
      .describe(SecretSyncs.UPDATE(destination).syncOptions)
  });
