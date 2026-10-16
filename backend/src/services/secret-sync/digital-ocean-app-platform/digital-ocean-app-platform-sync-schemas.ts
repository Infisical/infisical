import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

export const DIGITAL_OCEAN_ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const DIGITAL_OCEAN_ENV_KEY_RULE =
  "DigitalOcean environment variable names must start with a letter or underscore and contain only letters, digits and underscores (no hyphens).";

const DigitalOceanAppPlatformSyncDestinationConfigSchema = z.object({
  appId: z.string().min(1, "Account ID is required").max(255, "Account ID must be less than 255 characters"),
  appName: z.string().min(1, "Account Name is required").max(255, "Account Name must be less than 255 characters")
});

const DigitalOceanAppPlatformSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const DigitalOceanAppPlatformSyncSchema = BaseSecretSyncSchema(
  SecretSync.DigitalOceanAppPlatform,
  DigitalOceanAppPlatformSyncOptionsConfig
)
  .extend({
    destination: z.literal(SecretSync.DigitalOceanAppPlatform),
    destinationConfig: DigitalOceanAppPlatformSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.DigitalOceanAppPlatform] }));

export const CreateDigitalOceanAppPlatformSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.DigitalOceanAppPlatform,
  DigitalOceanAppPlatformSyncOptionsConfig
).extend({
  destinationConfig: DigitalOceanAppPlatformSyncDestinationConfigSchema
});

export const UpdateDigitalOceanAppPlatformSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.DigitalOceanAppPlatform,
  DigitalOceanAppPlatformSyncOptionsConfig
).extend({
  destinationConfig: DigitalOceanAppPlatformSyncDestinationConfigSchema.optional()
});

export const DigitalOceanAppPlatformSyncListItemSchema = z
  .object({
    name: z.literal("Digital Ocean App Platform"),
    connection: z.literal(AppConnection.DigitalOcean),
    destination: z.literal(SecretSync.DigitalOceanAppPlatform),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.DigitalOceanAppPlatform] }));
