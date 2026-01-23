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

const CircleCISyncDestinationConfigSchema = z.object({
  projectSlug: z
    .string()
    .min(1, "Project slug is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.projectSlug),
  projectName: z
    .string()
    .min(1, "Project name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.projectName)
    .optional()
});

const CreateCircleCISyncDestinationConfigSchema = CircleCISyncDestinationConfigSchema.extend({
  projectName: z
    .string()
    .min(1, "Project name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.projectName)
});

const CircleCISyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: false };

export const CircleCISyncSchema = BaseSecretSyncSchema(SecretSync.CircleCI, CircleCISyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.CircleCI),
    destinationConfig: CircleCISyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CircleCI] }));

export const CreateCircleCISyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.CircleCI,
  CircleCISyncOptionsConfig
).extend({
  destinationConfig: CreateCircleCISyncDestinationConfigSchema
});

export const UpdateCircleCISyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.CircleCI,
  CircleCISyncOptionsConfig
).extend({
  destinationConfig: CircleCISyncDestinationConfigSchema.optional()
});

export const CircleCISyncListItemSchema = z
  .object({
    name: z.literal("CircleCI"),
    connection: z.literal(AppConnection.CircleCI),
    destination: z.literal(SecretSync.CircleCI),
    canImportSecrets: z.literal(false)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.CircleCI] }));
