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
import { CloudflarePagesVariableType } from "./cloudflare-pages-constants";

const CloudflarePagesSyncDestinationConfigSchema = z.object({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.projectName),
  environment: z
    .string()
    .min(1, "Environment is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.environment),
  variableType: z
    .nativeEnum(CloudflarePagesVariableType)
    .optional()
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.variableType)
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
  // New syncs always get a type. It stays optional elsewhere because syncs created before it existed have
  // none, and those skip same-name text variables.
  destinationConfig: CloudflarePagesSyncDestinationConfigSchema.extend({
    variableType: z
      .nativeEnum(CloudflarePagesVariableType)
      .default(CloudflarePagesVariableType.Secret)
      .describe(SecretSyncs.DESTINATION_CONFIG.CLOUDFLARE_PAGES.variableType)
  })
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
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CloudflarePages] }));
