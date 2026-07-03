import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { SECRET_SYNC_NAME_MAP } from "@app/services/secret-sync/secret-sync-maps";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

const Cloud66SyncDestinationConfigSchema = z.object({
  stackId: z.string().trim().min(1, "Stack ID is required").describe(SecretSyncs.DESTINATION_CONFIG.CLOUD66.stackId),
  stackName: z
    .string()
    .trim()
    .min(1, "Stack Name is required")
    .describe(SecretSyncs.DESTINATION_CONFIG.CLOUD66.stackName)
});

const Cloud66SyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const Cloud66SyncSchema = BaseSecretSyncSchema(SecretSync.Cloud66, Cloud66SyncOptionsConfig)
  .extend({
    destination: z.literal(SecretSync.Cloud66),
    destinationConfig: Cloud66SyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Cloud66] }));

export const CreateCloud66SyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.Cloud66,
  Cloud66SyncOptionsConfig
).extend({
  destinationConfig: Cloud66SyncDestinationConfigSchema
});

export const UpdateCloud66SyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.Cloud66,
  Cloud66SyncOptionsConfig
).extend({
  destinationConfig: Cloud66SyncDestinationConfigSchema.optional()
});

export const Cloud66SyncListItemSchema = z
  .object({
    name: z.literal("Cloud 66"),
    connection: z.literal(AppConnection.Cloud66),
    destination: z.literal(SecretSync.Cloud66),
    canImportSecrets: z.literal(true),
    canRemoveSecretsOnDeletion: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.Cloud66] }));
