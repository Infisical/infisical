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

const ChecklySyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Checkly project ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.projectId),
  projectName: z.string().trim().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.projectName),
  environmentId: z
    .string()
    .trim()
    .min(1, "Checkly environment ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.environmentId),
  environmentName: z.string().trim().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.environmentName),
  serviceId: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.serviceId),
  serviceName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.serviceName)
});

const ChecklySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const ChecklySyncSchema = BaseSecretSyncSchema(SecretSync.Checkly, ChecklySyncOptionsConfig).extend({
  destination: z.literal(SecretSync.Checkly),
  destinationConfig: ChecklySyncDestinationConfigSchema
});

export const CreateChecklySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Checkly,
  ChecklySyncOptionsConfig
).extend({
  destinationConfig: ChecklySyncDestinationConfigSchema
});

export const UpdateChecklySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Checkly,
  ChecklySyncOptionsConfig
).extend({
  destinationConfig: ChecklySyncDestinationConfigSchema.optional()
});

export const ChecklySyncListItemSchema = z.object({
  name: z.literal("Checkly"),
  connection: z.literal(AppConnection.Checkly),
  destination: z.literal(SecretSync.Checkly),
  canImportSecrets: z.literal(false)
});
