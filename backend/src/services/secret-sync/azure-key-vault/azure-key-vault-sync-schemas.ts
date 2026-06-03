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
import { AzureKeyVaultSyncMappingBehavior } from "./azure-key-vault-sync-enums";

const AzureKeyVaultSyncDestinationConfigInputSchema = z
  .discriminatedUnion("mappingBehavior", [
    z.object({
      mappingBehavior: z
        .literal(AzureKeyVaultSyncMappingBehavior.OneToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_KEY_VAULT.mappingBehavior)
    }),
    z.object({
      mappingBehavior: z
        .literal(AzureKeyVaultSyncMappingBehavior.ManyToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_KEY_VAULT.mappingBehavior),
      secretName: z
        .string()
        .min(1, "Secret name is required")
        .max(127, "Secret name cannot exceed 127 characters")
        .regex(/^[a-zA-Z0-9-]+$/, "Secret name must contain only alphanumeric characters and hyphens")
        .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_KEY_VAULT.secretName)
    })
  ])
  .and(
    z.object({
      vaultBaseUrl: z
        .string()
        .url("Invalid vault base URL format")
        .min(1, "Vault base URL required")
        .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_KEY_VAULT.vaultBaseUrl)
    })
  );

// Backward-compatible schema for response serialization: existing AKV sync records
// created before Many-to-One support won't have mappingBehavior in their destinationConfig.
// Default to OneToOne so Fastify serialization doesn't fail with a 500 error.
const AzureKeyVaultSyncDestinationConfigSchema = z.preprocess((data) => {
  if (typeof data === "object" && data !== null && !("mappingBehavior" in (data as Record<string, unknown>))) {
    return { ...(data as Record<string, unknown>), mappingBehavior: AzureKeyVaultSyncMappingBehavior.OneToOne };
  }
  return data;
}, AzureKeyVaultSyncDestinationConfigInputSchema);

const AzureKeyVaultSyncOptionsSchema = z.object({
  disableCertificateImport: z
    .boolean()
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AZURE_KEY_VAULT.disableCertificateImport)
});

const AzureKeyVaultSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AzureKeyVaultSyncSchema = BaseSecretSyncSchema(
  SecretSync.AzureKeyVault,
  AzureKeyVaultSyncOptionsConfig,
  AzureKeyVaultSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.AzureKeyVault),
    destinationConfig: AzureKeyVaultSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureKeyVault] }));

export const CreateAzureKeyVaultSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AzureKeyVault,
  AzureKeyVaultSyncOptionsConfig,
  AzureKeyVaultSyncOptionsSchema
).extend({
  destinationConfig: AzureKeyVaultSyncDestinationConfigInputSchema
});

export const UpdateAzureKeyVaultSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AzureKeyVault,
  AzureKeyVaultSyncOptionsConfig,
  AzureKeyVaultSyncOptionsSchema
).extend({
  destinationConfig: AzureKeyVaultSyncDestinationConfigInputSchema.optional()
});

export const AzureKeyVaultSyncListItemSchema = z
  .object({
    name: z.literal("Azure Key Vault"),
    connection: z.literal(AppConnection.AzureKeyVault),
    destination: z.literal(SecretSync.AzureKeyVault),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureKeyVault] }));
