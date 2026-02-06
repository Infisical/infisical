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

const FlyioSyncDestinationConfigSchema = z.object({
  appId: z.string().trim().min(1, "App required").max(255).describe(SecretSyncs.DESTINATION_CONFIG.FLYIO.appId),
  appName: z.string().trim().optional().describe(SecretSyncs.DESTINATION_CONFIG.FLYIO.appName)
});

const FlyioSyncOptionsSchema = z.object({
  autoRedeploy: z.boolean().optional().describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.FLYIO.autoRedeploy)
});

const FlyioSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const FlyioSyncSchema = BaseSecretSyncSchema(SecretSync.Flyio, FlyioSyncOptionsConfig, FlyioSyncOptionsSchema)
  .extend({
    destination: z.literal(SecretSync.Flyio),
    destinationConfig: FlyioSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Flyio] }));

export const CreateFlyioSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Flyio,
  FlyioSyncOptionsConfig,
  FlyioSyncOptionsSchema
).extend({
  destinationConfig: FlyioSyncDestinationConfigSchema
});

export const UpdateFlyioSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Flyio,
  FlyioSyncOptionsConfig,
  FlyioSyncOptionsSchema
).extend({
  destinationConfig: FlyioSyncDestinationConfigSchema.optional()
});

export const FlyioSyncListItemSchema = z
  .object({
    name: z.literal("Fly.io"),
    connection: z.literal(AppConnection.Flyio),
    destination: z.literal(SecretSync.Flyio),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Flyio] }));
