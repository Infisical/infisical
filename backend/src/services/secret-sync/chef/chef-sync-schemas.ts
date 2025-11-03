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

const ChefSyncDestinationConfigSchema = z.object({
  dataBagName: z
    .string()
    .min(1, "Data Bag Name is required")
    .max(256, "Data Bag Name cannot exceed 256 characters")
    .describe(SecretSyncs.DESTINATION_CONFIG.CHEF.dataBagName),
  dataBagItemName: z
    .string()
    .min(1, "Data Bag Item Name is required")
    .max(256, "Data Bag Item Name cannot exceed 256 characters")
    .describe(SecretSyncs.DESTINATION_CONFIG.CHEF.dataBagItemName)
});

const ChefSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ChefSyncSchema = BaseSecretSyncSchema(SecretSync.Chef, ChefSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Chef),
  destinationConfig: ChefSyncDestinationConfigSchema
});

export const CreateChefSyncSchema = GenericCreateSecretSyncFieldsSchema(SecretSync.Chef, ChefSyncOptionsConfig).extend({
  destinationConfig: ChefSyncDestinationConfigSchema
});

export const UpdateChefSyncSchema = GenericUpdateSecretSyncFieldsSchema(SecretSync.Chef, ChefSyncOptionsConfig).extend({
  destinationConfig: ChefSyncDestinationConfigSchema.optional()
});

export const ChefSyncListItemSchema = z.object({
  name: z.literal("Chef"),
  connection: z.literal(AppConnection.Chef),
  destination: z.literal(SecretSync.Chef),
  canImportSecrets: z.literal(true)
});
