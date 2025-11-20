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

export const AzureDevOpsSyncDestinationConfigSchema = z.object({
  devopsProjectId: z
    .string()
    .min(1, "Project ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_DEVOPS?.devopsProjectId || "Azure DevOps Project ID"),
  devopsProjectName: z
    .string()
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.AZURE_DEVOPS?.devopsProjectName || "Azure DevOps Project Name")
});

const AzureDevOpsSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const AzureDevOpsSyncSchema = BaseSecretSyncSchema(SecretSync.AzureDevOps, AzureDevOpsSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.AzureDevOps),
    destinationConfig: AzureDevOpsSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureDevOps] }));

export const CreateAzureDevOpsSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AzureDevOps,
  AzureDevOpsSyncOptionsConfig
).extend({
  destinationConfig: AzureDevOpsSyncDestinationConfigSchema
});

export const UpdateAzureDevOpsSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AzureDevOps,
  AzureDevOpsSyncOptionsConfig
).extend({
  destinationConfig: AzureDevOpsSyncDestinationConfigSchema.optional()
});

export const AzureDevOpsSyncListItemSchema = z
  .object({
    name: z.literal("Azure DevOps"),
    connection: z.literal(AppConnection.AzureDevOps),
    destination: z.literal(SecretSync.AzureDevOps),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AzureDevOps] }));
