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

const SnowflakeSyncDestinationConfigSchema = z.object({
  database: z.string().trim().min(1, "Database required").describe(SecretSyncs.DESTINATION_CONFIG.SNOWFLAKE.database),
  schema: z.string().trim().min(1, "Schema required").describe(SecretSyncs.DESTINATION_CONFIG.SNOWFLAKE.schema)
});

const SnowflakeSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const SnowflakeSyncSchema = BaseSecretSyncSchema(SecretSync.Snowflake, SnowflakeSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Snowflake),
    destinationConfig: SnowflakeSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Snowflake] }));

export const CreateSnowflakeSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Snowflake,
  SnowflakeSyncOptionsConfig
).extend({
  destinationConfig: SnowflakeSyncDestinationConfigSchema
});

export const UpdateSnowflakeSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Snowflake,
  SnowflakeSyncOptionsConfig
).extend({
  destinationConfig: SnowflakeSyncDestinationConfigSchema.optional()
});

export const SnowflakeSyncListItemSchema = z
  .object({
    name: z.literal("Snowflake"),
    connection: z.literal(AppConnection.Snowflake),
    destination: z.literal(SecretSync.Snowflake),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Snowflake] }));
