import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { wrapWithSlashes } from "@app/lib/fn";
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
    .min(1, "Parameter Store Path Required")
    .transform(wrapWithSlashes)
    .superRefine((val, ctx) => {
      if (!/^\/([\w-]+\/)*[\w-]+\/$/.test(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid Parameter Store Path - must follow "/example/path/" format`
        });
      }

      if (val.length > 2048) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid Parameter Store Path - cannot exceed 2048 characters`
        });
      }
    })
    .describe(SecretSyncs.DESTINATION_CONFIG.AWS_PARAMETER_STORE.PATH)
});

export const AwsParameterStoreSyncSchema = BaseSecretSyncSchema(AppConnection.AWS).extend({
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
  supportsImport: z.literal(true)
});
