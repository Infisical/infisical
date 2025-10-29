import z from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const CoolifySyncOptionsSchema = z.object({
  autoRedeployServices: z
    .boolean()
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.COOLIFY.autoRedeployServices)
});

const CoolifySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

const CoolifySyncDestinationConfigSchema = z.object({
  appId: z
    .string()
    .trim()
    .cuid2("Application/Service required")
    .describe(SecretSyncs.DESTINATION_CONFIG.COOLIFY.applicationId)
});

export const CoolifySyncSchema = BaseSecretSyncSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destination: z.literal(SecretSync.Coolify),
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const CreateCoolifySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema
});

export const UpdateCoolifySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Coolify,
  CoolifySyncOptionsConfig,
  CoolifySyncOptionsSchema
).extend({
  destinationConfig: CoolifySyncDestinationConfigSchema.optional()
});

export const CoolifySyncListItemSchema = z.object({
  name: z.literal("Coolify"),
  connection: z.literal(AppConnection.Coolify),
  destination: z.literal(SecretSync.Coolify),
  canImportSecrets: z.literal(true)
});
