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

const AzureKeyVaultSyncDestinationConfigSchema = z.object({
  vaultBaseUrl: z
    .string()
    .url("Invalid vault base URL format")
    .min(1, "Vault base URL required")
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_KEY_VAULT.vaultBaseUrl)
});

const AzureKeyVaultSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AzureKeyVaultSyncSchema = BaseSecretSyncSchema(SecretSync.AzureKeyVault, AzureKeyVaultSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.AzureKeyVault),
    destinationConfig: AzureKeyVaultSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureKeyVault] }));

export const CreateAzureKeyVaultSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AzureKeyVault,
  AzureKeyVaultSyncOptionsConfig
).extend({
  destinationConfig: AzureKeyVaultSyncDestinationConfigSchema
});

export const UpdateAzureKeyVaultSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AzureKeyVault,
  AzureKeyVaultSyncOptionsConfig
).extend({
  destinationConfig: AzureKeyVaultSyncDestinationConfigSchema.optional()
});

export const AzureKeyVaultSyncListItemSchema = z
  .object({
    name: z.literal("Azure Key Vault"),
    connection: z.literal(AppConnection.AzureKeyVault),
    destination: z.literal(SecretSync.AzureKeyVault),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureKeyVault] }));
