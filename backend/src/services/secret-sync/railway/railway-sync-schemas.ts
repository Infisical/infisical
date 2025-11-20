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

const RailwaySyncDestinationConfigSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1, "Railway project ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.projectId),
  projectName: z.string().trim().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.projectName),
  environmentId: z
    .string()
    .trim()
    .min(1, "Railway environment ID required")
    .describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.environmentId),
  environmentName: z.string().trim().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.environmentName),
  serviceId: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.serviceId),
  serviceName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.RAILWAY.serviceName)
});

const RailwaySyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const RailwaySyncSchema = BaseSecretSyncSchema(SecretSync.Railway, RailwaySyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Railway),
    destinationConfig: RailwaySyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Railway] }));

export const CreateRailwaySyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Railway,
  RailwaySyncOptionsConfig
).extend({
  destinationConfig: RailwaySyncDestinationConfigSchema
});

export const UpdateRailwaySyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Railway,
  RailwaySyncOptionsConfig
).extend({
  destinationConfig: RailwaySyncDestinationConfigSchema.optional()
});

export const RailwaySyncListItemSchema = z
  .object({
    name: z.literal("Railway"),
    connection: z.literal(AppConnection.Railway),
    destination: z.literal(SecretSync.Railway),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Railway] }));
