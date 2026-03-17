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

const ExternalInfisicalSyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_INFISICAL.projectId),
  environment: z
    .string()
    .trim()
    .min(1, "Environment slug is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_INFISICAL.environment),
  secretPath: z
    .string()
    .trim()
    .min(1, "Secret path is required")
    .default("/")
    .describe(SecretSyncs.DESTINATION_CONFIG.EXTERNAL_INFISICAL.secretPath)
});

const ExternalInfisicalSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ExternalInfisicalSyncSchema = BaseSecretSyncSchema(
  SecretSync.ExternalInfisical,
  ExternalInfisicalSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.ExternalInfisical),
    destinationConfig: ExternalInfisicalSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.ExternalInfisical] }));

export const CreateExternalInfisicalSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.ExternalInfisical,
  ExternalInfisicalSyncOptionsConfig
).extend({
  destinationConfig: ExternalInfisicalSyncDestinationConfigSchema
});

export const UpdateExternalInfisicalSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.ExternalInfisical,
  ExternalInfisicalSyncOptionsConfig
).extend({
  destinationConfig: ExternalInfisicalSyncDestinationConfigSchema.optional()
});

export const ExternalInfisicalSyncListItemSchema = z
  .object({
    name: z.literal("Infisical"),
    connection: z.literal(AppConnection.ExternalInfisical),
    destination: z.literal(SecretSync.ExternalInfisical),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.ExternalInfisical] }));
