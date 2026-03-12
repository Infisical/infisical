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

const AzureEntraIdScimSyncDestinationConfigSchema = z.object({
  servicePrincipalId: z
    .string()
    .trim()
    .min(1, "Service Principal ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_ENTRA_ID_SCIM.servicePrincipalId),
  servicePrincipalDisplayName: z
    .string()
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_ENTRA_ID_SCIM.servicePrincipalDisplayName)
});

const AzureEntraIdScimSyncOptionsConfig: TSyncOptionsConfig = {
  canImportSecrets: false,
  supportsKeySchema: false,
  supportsDisableSecretDeletion: false
};

const AzureEntraIdScimSyncOptionsReadSchema = z.object({
  secretId: z
    .string()
    .uuid()
    .describe("The ID of the Infisical secret whose value will be used as the SCIM provisioning token.")
});

const AzureEntraIdScimSyncOptionsInputSchema = z.object({
  secretKey: z
    .string()
    .trim()
    .min(1, "Secret key is required")
    .describe("The key of the Infisical secret whose value will be used as the SCIM provisioning token.")
});

export const AzureEntraIdScimSyncSchema = BaseSecretSyncSchema(
  SecretSync.AzureEntraIdScim,
  AzureEntraIdScimSyncOptionsConfig,
  AzureEntraIdScimSyncOptionsReadSchema
)
  .extend({
    destination: z.literal(SecretSync.AzureEntraIdScim),
    destinationConfig: AzureEntraIdScimSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureEntraIdScim] }));

export const CreateAzureEntraIdScimSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AzureEntraIdScim,
  AzureEntraIdScimSyncOptionsConfig,
  AzureEntraIdScimSyncOptionsInputSchema
).extend({
  destinationConfig: AzureEntraIdScimSyncDestinationConfigSchema
});

export const UpdateAzureEntraIdScimSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AzureEntraIdScim,
  AzureEntraIdScimSyncOptionsConfig,
  AzureEntraIdScimSyncOptionsInputSchema
).extend({
  destinationConfig: AzureEntraIdScimSyncDestinationConfigSchema.optional()
});

export const AzureEntraIdScimSyncListItemSchema = z
  .object({
    name: z.literal("Azure Entra ID SCIM"),
    connection: z.literal(AppConnection.AzureEntraId),
    destination: z.literal(SecretSync.AzureEntraIdScim),
    canImportSecrets: z.literal(false),
    supportsKeySchema: z.literal(false),
    supportsDisableSecretDeletion: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureEntraIdScim] }));
