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

const OCIVaultSyncDestinationConfigSchema = z.object({
  compartmentOcid: z
    .string()
    .trim()
    .min(1, "Compartment OCID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.compartmentOcid),
  vaultOcid: z
    .string()
    .trim()
    .min(1, "Vault OCID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.vaultOcid),
  keyOcid: z.string().trim().min(1, "Key OCID required").describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.keyOcid)
});

const OCIVaultSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const OCIVaultSyncSchema = BaseSecretSyncSchema(SecretSync.OCIVault, OCIVaultSyncOptionsConfig).extend({
  destination: z.literal(SecretSync.OCIVault),
  destinationConfig: OCIVaultSyncDestinationConfigSchema
});

export const CreateOCIVaultSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.OCIVault,
  OCIVaultSyncOptionsConfig
).extend({
  destinationConfig: OCIVaultSyncDestinationConfigSchema
});

export const UpdateOCIVaultSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.OCIVault,
  OCIVaultSyncOptionsConfig
).extend({
  destinationConfig: OCIVaultSyncDestinationConfigSchema.optional()
});

export const OCIVaultSyncListItemSchema = z.object({
  name: z.literal("OCI Vault"),
  connection: z.literal(AppConnection.OCI),
  destination: z.literal(SecretSync.OCIVault),
  canImportSecrets: z.literal(true)
});
