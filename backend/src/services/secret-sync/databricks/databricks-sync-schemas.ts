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

const DatabricksSyncDestinationConfigSchema = z.object({
  scope: z.string().trim().min(1, "Databricks scope required").describe(SecretSyncs.DESTINATION_CONFIG.DATABRICKS.scope)
});

const DatabricksSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const DatabricksSyncSchema = BaseSecretSyncSchema(SecretSync.Databricks, DatabricksSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Databricks),
    destinationConfig: DatabricksSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Databricks] }));

export const CreateDatabricksSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Databricks,
  DatabricksSyncOptionsConfig
).extend({
  destinationConfig: DatabricksSyncDestinationConfigSchema
});

export const UpdateDatabricksSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Databricks,
  DatabricksSyncOptionsConfig
).extend({
  destinationConfig: DatabricksSyncDestinationConfigSchema.optional()
});

export const DatabricksSyncListItemSchema = z
  .object({
    name: z.literal("Databricks"),
    connection: z.literal(AppConnection.Databricks),
    destination: z.literal(SecretSync.Databricks),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Databricks] }));
