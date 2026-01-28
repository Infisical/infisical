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
  orgName: z.string().trim().min(1, "Organization is required"),
  projectName: z.string().trim().min(1, "Project is required"),
  projectId: z.string().trim().min(1, "Project ID is required")
});

const CreateCircleCISyncDestinationConfigSchema = CircleCISyncDestinationConfigSchema.extend({
  orgName: z.string().min(1, "Organization name is required").describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.orgName),
  projectName: z
    .string()
    .min(1, "Project name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.projectName),
  projectId: z
    .string()
    .trim()
    .min(1, "Project ID is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CIRCLECI.projectId)
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
