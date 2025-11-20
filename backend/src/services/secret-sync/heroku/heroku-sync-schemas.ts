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

const HerokuSyncDestinationConfigSchema = z.object({
  app: z.string().trim().min(1, "App required").describe(SecretSyncs.DESTINATION_CONFIG.HEROKU.app),
  appName: z.string().trim().min(1, "App name required").describe(SecretSyncs.DESTINATION_CONFIG.HEROKU.appName)
});

const HerokuSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const HerokuSyncSchema = BaseSecretSyncSchema(SecretSync.Heroku, HerokuSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Heroku),
    destinationConfig: HerokuSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Heroku] }));

export const CreateHerokuSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Heroku,
  HerokuSyncOptionsConfig
).extend({
  destinationConfig: HerokuSyncDestinationConfigSchema
});

export const UpdateHerokuSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Heroku,
  HerokuSyncOptionsConfig
).extend({
  destinationConfig: HerokuSyncDestinationConfigSchema.optional()
});

export const HerokuSyncListItemSchema = z
  .object({
    name: z.literal("Heroku"),
    connection: z.literal(AppConnection.Heroku),
    destination: z.literal(SecretSync.Heroku),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Heroku] }));
