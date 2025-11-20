import RE2 from "re2";
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

const slugValidator = (val: string) => {
  return new RE2("^[a-z0-9.-]+$").test(val) && !new RE2(".[-]$").test(val);
};

const LaravelForgeSyncDestinationConfigSchema = z.object({
  orgSlug: z
    .string()
    .min(1, "Org Slug is required")
    .max(512, "Org Slug cannot exceed 512 characters")
    .refine(
      (val) => slugValidator(val),
      "Org Slug can only contain lowercase letters, numbers, dots, and dashes, and cannot end with a dot or dash."
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.orgSlug),
  orgName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.orgName),
  serverId: z
    .string()
    .min(1, "Server ID is required")
    .refine((val) => !Number.isNaN(Number(val)), "Server ID must be a valid integer")
    .describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.serverId),
  serverName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.serverName),
  siteId: z.string().min(1, "Site ID is required").describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.siteId),
  siteName: z.string().optional().describe(SecretSyncs.DESTINATION_CONFIG.LARAVEL_FORGE.siteName)
});

const LaravelForgeSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const LaravelForgeSyncSchema = BaseSecretSyncSchema(SecretSync.LaravelForge, LaravelForgeSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.LaravelForge),
    destinationConfig: LaravelForgeSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.LaravelForge] }));

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

export const LaravelForgeSyncListItemSchema = z
  .object({
    name: z.literal("Laravel Forge"),
    connection: z.literal(AppConnection.LaravelForge),
    destination: z.literal(SecretSync.LaravelForge),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.LaravelForge] }));
