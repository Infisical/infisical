import RE2 from "re2";
import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
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
    .refine(
      (val) => new RE2("^ocid1\\.(tenancy|compartment)\\.oc1\\..+$").test(val),
      "Invalid Compartment OCID format. Must start with ocid1.tenancy.oc1. or ocid1.compartment.oc1."
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.compartmentOcid),
  vaultOcid: z
    .string()
    .trim()
    .min(1, "Vault OCID required")
    .refine(
      (val) => new RE2("^ocid1\\.vault\\.oc1\\..+$").test(val),
      "Invalid Vault OCID format. Must start with ocid1.vault.oc1."
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.vaultOcid),
  keyOcid: z
    .string()
    .trim()
    .min(1, "Key OCID required")
    .refine(
      (val) => new RE2("^ocid1\\.key\\.oc1\\..+$").test(val),
      "Invalid Key OCID format. Must start with ocid1.key.oc1."
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.OCI_VAULT.keyOcid)
});

const OCIVaultSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const OCIVaultSyncSchema = BaseSecretSyncSchema(SecretSync.OCIVault, OCIVaultSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.OCIVault),
    destinationConfig: OCIVaultSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OCIVault] }));

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

export const OCIVaultSyncListItemSchema = z
  .object({
    name: z.literal("OCI Vault"),
    connection: z.literal(AppConnection.OCI),
    destination: z.literal(SecretSync.OCIVault),
    canImportSecrets: z.literal(true),
    enterprise: z.boolean()
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.OCIVault] }));
