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

const HumanitecSyncDestinationConfigSchema = z.object({
  app: z.string().min(1, "App ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.app),
  org: z.string().min(1, "Org ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.org),
  env: z.string().min(1, "Env ID is required").describe(SecretSyncs.DESTINATION_CONFIG.HUMANITEC.env)
});

const HumanitecSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const HumanitecSyncSchema = BaseSecretSyncSchema(SecretSync.Humanitec, HumanitecSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Humanitec),
  destinationConfig: HumanitecSyncDestinationConfigSchema
});

export const CreateHumanitecSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Humanitec,
  HumanitecSyncOptionsConfig
).extend({
  destinationConfig: HumanitecSyncDestinationConfigSchema
});

export const UpdateHumanitecSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Humanitec,
  HumanitecSyncOptionsConfig
).extend({
  destinationConfig: HumanitecSyncDestinationConfigSchema.optional()
});

export const HumanitecSyncListItemSchema = z.object({
  name: z.literal("Humanitec"),
  connection: z.literal(AppConnection.Humanitec),
  destination: z.literal(SecretSync.Humanitec),
  canImportSecrets: z.literal(false)
});
