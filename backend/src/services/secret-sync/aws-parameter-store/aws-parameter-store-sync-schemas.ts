import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";

const AwsParameterStoreSyncDestinationConfigSchema = z.object({
  region: z.nativeEnum(AWSRegion).describe(SecretSyncs.DESTINATION_CONFIG.AWS_PARAMETER_STORE.REGION),
  path: z
    .string()
    .trim()
    .min(1, "Parameter Store Path required")
    .max(2048, "Cannot exceed 2048 characters")
    .regex(/^\/([/]|(([\w-]+\/)+))?$/, 'Invalid path - must follow "/example/path/" format')
    .describe(SecretSyncs.DESTINATION_CONFIG.AWS_PARAMETER_STORE.PATH)
});

export const AwsParameterStoreSyncSchema = BaseSecretSyncSchema(SecretSync.AWSParameterStore).extend({
  destination: z.literal(SecretSync.AWSParameterStore),
  destinationConfig: AwsParameterStoreSyncDestinationConfigSchema
});

export const CreateAwsParameterStoreSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AWSParameterStore
).extend({
  destinationConfig: AwsParameterStoreSyncDestinationConfigSchema
});

export const UpdateAwsParameterStoreSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AWSParameterStore
).extend({
  destinationConfig: AwsParameterStoreSyncDestinationConfigSchema.optional()
});

export const AwsParameterStoreSyncListItemSchema = z.object({
  name: z.literal("AWS Parameter Store"),
  connection: z.literal(AppConnection.AWS),
  destination: z.literal(SecretSync.AWSParameterStore),
  canImportSecrets: z.literal(true)
});
