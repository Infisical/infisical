import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const NorthflankSyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.NORTHFLANK.projectId),
  projectName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.NORTHFLANK.projectName),
  secretGroupId: z
    .string()
    .trim()
    .min(1, "Secret Group ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.NORTHFLANK.secretGroupId),
  secretGroupName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.NORTHFLANK.secretGroupName)
});

const NorthflankSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const NorthflankSyncSchema = BaseSecretSyncSchema(SecretSync.Northflank, NorthflankSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Northflank),
    destinationConfig: NorthflankSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Northflank] }));

export const CreateNorthflankSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Northflank,
  NorthflankSyncOptionsConfig
).extend({
  destinationConfig: NorthflankSyncDestinationConfigSchema
});

export const UpdateNorthflankSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Northflank,
  NorthflankSyncOptionsConfig
).extend({
  destinationConfig: NorthflankSyncDestinationConfigSchema.optional()
});

export const NorthflankSyncListItemSchema = z
  .object({
    name: z.literal("Northflank"),
    connection: z.literal(AppConnection.Northflank),
    destination: z.literal(SecretSync.Northflank),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Northflank] }));
