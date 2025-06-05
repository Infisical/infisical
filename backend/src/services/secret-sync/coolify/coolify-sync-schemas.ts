import z from "zod";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSyncs } from "@app/lib/api-docs";

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const CoolifySyncDestinationConfigSchema = z.object({
  appId: z.string().trim().cuid2("Application/Service required").describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.applicationId)
});

export const CoolifySyncSchema = BaseSecretSyncSchema(SecretSync.Coolify, CoolifySyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Coolify),
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema.optional()
});

export const CoolifySyncListItemSchema = z.object({
  name: z.literal("Coolify"),
  connection: z.literal(AppConnection.Coolify),
  destination: z.literal(SecretSync.Coolify),
  canImportSecrets: z.literal(true)
});
