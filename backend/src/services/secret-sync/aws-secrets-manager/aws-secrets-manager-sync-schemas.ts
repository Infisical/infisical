import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";

const AwsSecretsManagerSyncDestinationConfigSchema = z
  .discriminatedUnion("mappingBehavior", [
    z.object({
      mappingBehavior: z
        .literal(AwsSecretsManagerSyncMappingBehavior.OneToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.MAPPING_BEHAVIOR)
    }),
    z.object({
      mappingBehavior: z
        .literal(AwsSecretsManagerSyncMappingBehavior.ManyToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.MAPPING_BEHAVIOR),
      secretName: z
        .string()
        .regex(
          /^[a-zA-Z0-9/_+=.@-]+$/,
          "Secret name must contain only alphanumeric characters and the characters /_+=.@-"
        )
        .min(1, "Secret name is required")
        .max(256, "Secret name cannot exceed 256 characters")
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.SECRET_NAME)
    })
  ])
  .and(
    z.object({
      region: z.nativeEnum(AWSRegion).describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.REGION)
    })
  );

export const AwsSecretsManagerSyncSchema = BaseSecretSyncSchema(SecretSync.AWSSecretsManager).extend({
  destination: z.literal(SecretSync.AWSSecretsManager),
  destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema
});

export const CreateAwsSecretsManagerSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AWSSecretsManager
).extend({
  destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema
});

export const UpdateAwsSecretsManagerSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AWSSecretsManager
).extend({
  destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema.optional()
});

export const AwsSecretsManagerSyncListItemSchema = z.object({
  name: z.literal("AWS Secrets Manager"),
  connection: z.literal(AppConnection.AWS),
  destination: z.literal(SecretSync.AWSSecretsManager),
  canImportSecrets: z.literal(true)
});
