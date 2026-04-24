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

const TravisCISyncDestinationConfigSchema = z.object({
  repositoryId: z
    .string()
    .trim()
    .min(1, "Repository ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.TRAVIS_CI.repositoryId),
  repositorySlug: z
    .string()
    .trim()
    .min(1, "Repository slug is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.TRAVIS_CI.repositorySlug),
  branch: z.string().trim().min(1).optional().describe(SecretSyncs.DESTINATION_CONFIG.TRAVIS_CI.branch)
});

const TravisCISyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const TravisCISyncSchema = BaseSecretSyncSchema(SecretSync.TravisCI, TravisCISyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.TravisCI),
    destinationConfig: TravisCISyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TravisCI] }));

export const CreateTravisCISyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.TravisCI,
  TravisCISyncOptionsConfig
).extend({
  destinationConfig: TravisCISyncDestinationConfigSchema
});

export const UpdateTravisCISyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.TravisCI,
  TravisCISyncOptionsConfig
).extend({
  destinationConfig: TravisCISyncDestinationConfigSchema.optional()
});

export const TravisCISyncListItemSchema = z
  .object({
    name: z.literal("Travis CI"),
    connection: z.literal(AppConnection.TravisCI),
    destination: z.literal(SecretSync.TravisCI),
    canImportSecrets: z.literal(false),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.TravisCI] }));
