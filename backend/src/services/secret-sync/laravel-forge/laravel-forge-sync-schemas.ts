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

const LaravelForgeSyncDestinationConfigSchema = z.object({
  orgSlug: z.string().min(1, "Org Slug is required").describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.orgSlug),
  orgName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.orgName),
  serverId: z.string().min(1, "Server ID is required").describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.serverId),
  serverName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.serverName),
  siteId: z.string().min(1, "Site ID is required").describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.siteId),
  siteName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.siteName)
});

const LaravelForgeSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const LaravelForgeSyncSchema = BaseSecretSyncSchema(
  SecretSync.LaravelForge,
  LaravelForgeSyncOptionsConfig
).extend({
  destination: z.literal(SecretSync.LaravelForge),
  destinationConfig: LaravelForgeSyncDestinationConfigSchema
});

export const CreateLaravelForgeSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.LaravelForge,
  LaravelForgeSyncOptionsConfig
).extend({
  destinationConfig: LaravelForgeSyncDestinationConfigSchema
});

export const UpdateLaravelForgeSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.LaravelForge,
  LaravelForgeSyncOptionsConfig
).extend({
  destinationConfig: LaravelForgeSyncDestinationConfigSchema.optional()
});

export const LaravelForgeSyncListItemSchema = z.object({
  name: z.literal("Laravel Forge"),
  connection: z.literal(AppConnection.LaravelForge),
  destination: z.literal(SecretSync.LaravelForge),
  canImportSecrets: z.literal(true)
});
