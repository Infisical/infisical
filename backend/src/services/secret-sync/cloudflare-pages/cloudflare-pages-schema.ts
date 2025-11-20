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

const CloudflarePagesSyncDestinationConfigSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.projectName),
  environment: z
    .string()
    .min(1, "Environment is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.environment)
});

const CloudflarePagesSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const CloudflarePagesSyncSchema = BaseSecretSyncSchema(
  SecretSync.CloudflarePages,
  CloudflarePagesSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.CloudflarePages),
    destinationConfig: CloudflarePagesSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflarePages] }));

export const CreateCloudflarePagesSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.CloudflarePages,
  CloudflarePagesSyncOptionsConfig
).extend({
  destinationConfig: CloudflarePagesSyncDestinationConfigSchema
});

export const UpdateCloudflarePagesSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.CloudflarePages,
  CloudflarePagesSyncOptionsConfig
).extend({
  destinationConfig: CloudflarePagesSyncDestinationConfigSchema.optional()
});

export const CloudflarePagesSyncListItemSchema = z
  .object({
    name: z.literal("Cloudflare Pages"),
    connection: z.literal(AppConnection.Cloudflare),
    destination: z.literal(SecretSync.CloudflarePages),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflarePages] }));
