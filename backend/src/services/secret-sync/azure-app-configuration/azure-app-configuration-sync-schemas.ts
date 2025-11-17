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

const AzureAppConfigurationSyncDestinationConfigSchema = z.object({
  configurationUrl: z
    .string()
    .min(1, "App Configuration URL required")
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_APP_CONFIGURATION.configurationUrl),
  label: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.AZURE_APP_CONFIGURATION.label)
});

const AzureAppConfigurationSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AzureAppConfigurationSyncSchema = BaseSecretSyncSchema(
  SecretSync.AzureAppConfiguration,
  AzureAppConfigurationSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.AzureAppConfiguration),
    destinationConfig: AzureAppConfigurationSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureAppConfiguration] }));

export const CreateAzureAppConfigurationSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AzureAppConfiguration,
  AzureAppConfigurationSyncOptionsConfig
).extend({
  destinationConfig: AzureAppConfigurationSyncDestinationConfigSchema
});

export const UpdateAzureAppConfigurationSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AzureAppConfiguration,
  AzureAppConfigurationSyncOptionsConfig
).extend({
  destinationConfig: AzureAppConfigurationSyncDestinationConfigSchema.optional()
});

export const AzureAppConfigurationSyncListItemSchema = z
  .object({
    name: z.literal("Azure App Configuration"),
    connection: z.literal(AppConnection.AzureAppConfiguration),
    destination: z.literal(SecretSync.AzureAppConfiguration),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureAppConfiguration] }));
