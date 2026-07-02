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

const RundeckSyncDestinationConfigSchema = z.object({
  project: z.string().min(1, "Project is required").max(255),
  path: z
    .string()
    .min(1, "Path is required")
    .max(255)
    .startsWith("/", "Path must start with '/'")
    .refine((val) => val !== "." && val !== "..", "Invalid project name")
});

const RundeckSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const RundeckSyncSchema = BaseSecretSyncSchema(SecretSync.Rundeck, RundeckSyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Rundeck),
    destinationConfig: RundeckSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Rundeck] }));

export const CreateRundeckSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Rundeck,
  RundeckSyncOptionsConfig
).extend({
  destinationConfig: RundeckSyncDestinationConfigSchema
});

export const UpdateRundeckSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Rundeck,
  RundeckSyncOptionsConfig
).extend({
  destinationConfig: RundeckSyncDestinationConfigSchema.optional()
});

export const RundeckSyncListItemSchema = z
  .object({
    name: z.literal("Rundeck"),
    connection: z.literal(AppConnection.Rundeck),
    destination: z.literal(SecretSync.Rundeck),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Rundeck] }));
