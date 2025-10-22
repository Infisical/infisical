import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const NorthflankSyncDestinationConfigSchema = z.object({
  // TODO: Will be implemented in the follow up secret sync PR
  placeholder: z.string().optional()
});

const NorthflankSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const NorthflankSyncSchema = BaseSecretSyncSchema(SecretSync.Northflank, NorthflankSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Northflank),
  destinationConfig: NorthflankSyncDestinationConfigSchema
});

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

export const NorthflankSyncListItemSchema = z.object({
  name: z.literal("Northflank"),
  connection: z.literal(AppConnection.Northflank),
  destination: z.literal(SecretSync.Northflank),
  canImportSecrets: z.literal(true)
});
