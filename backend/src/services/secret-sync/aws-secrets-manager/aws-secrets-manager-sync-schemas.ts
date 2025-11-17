import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/services/secret-sync/aws-secrets-manager/aws-secrets-manager-sync-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

const AwsSecretsManagerSyncDestinationConfigSchema = z
  .discriminatedUnion("mappingBehavior", [
    z.object({
      mappingBehavior: z
        .literal(AwsSecretsManagerSyncMappingBehavior.OneToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.mappingBehavior)
    }),
    z.object({
      mappingBehavior: z
        .literal(AwsSecretsManagerSyncMappingBehavior.ManyToOne)
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.mappingBehavior),
      secretName: z
        .string()

        .min(1, "Secret name is required")
        .max(256, "Secret name cannot exceed 256 characters")
        .refine(
          (val) =>
            characterValidator([
              CharacterType.AlphaNumeric,
              CharacterType.ForwardSlash,
              CharacterType.Underscore,
              CharacterType.Plus,
              CharacterType.Equals,
              CharacterType.Period,
              CharacterType.At,
              CharacterType.Hyphen
            ])(val),
          "Secret name must contain only alphanumeric characters and the characters /_+=.@-"
        )
        .describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.secretName)
    })
  ])
  .and(
    z.object({
      region: z.nativeEnum(AWSRegion).describe(SecretSyncs.DESTINATION_CONFIG.AWS_SECRETS_MANAGER.region)
    })
  );

const tagFieldCharacterValidator = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Spaces,
  CharacterType.Period,
  CharacterType.Underscore,
  CharacterType.Colon,
  CharacterType.ForwardSlash,
  CharacterType.Equals,
  CharacterType.Plus,
  CharacterType.Hyphen,
  CharacterType.At
]);

const AwsSecretsManagerSyncOptionsSchema = z.object({
  keyId: z
    .string()
    .min(1, "Invalid KMS Key ID")
    .max(256, "Invalid KMS Key ID")
    .refine(
      (val) =>
        characterValidator([
          CharacterType.AlphaNumeric,
          CharacterType.Colon,
          CharacterType.ForwardSlash,
          CharacterType.Underscore,
          CharacterType.Hyphen
        ])(val),
      "Invalid KMS Key ID"
    )
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_SECRETS_MANAGER.keyId),
  tags: z
    .object({
      key: z
        .string()
        .min(1, "Tag key required")
        .max(128, "Tag key cannot exceed 128 characters")
        .refine(
          (val) => tagFieldCharacterValidator(val),
          "Invalid resource tag key: keys can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
        ),
      value: z
        .string()
        .max(256, "Tag value cannot exceed 256 characters")
        .refine(
          (val) => tagFieldCharacterValidator(val),
          "Invalid resource tag value: tag values can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
        )
    })
    .array()
    .max(50)
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, {
      message: "Tag keys must be unique"
    })
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_SECRETS_MANAGER.tags),
  syncSecretMetadataAsTags: z
    .boolean()
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_SECRETS_MANAGER.syncSecretMetadataAsTags)
});

const AwsSecretsManagerSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AwsSecretsManagerSyncSchema = BaseSecretSyncSchema(
  SecretSync.AWSSecretsManager,
  AwsSecretsManagerSyncOptionsConfig,
  AwsSecretsManagerSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.AWSSecretsManager),
    destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AWSSecretsManager] }));

export const CreateAwsSecretsManagerSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AWSSecretsManager,
  AwsSecretsManagerSyncOptionsConfig,
  AwsSecretsManagerSyncOptionsSchema
)
  .extend({
    destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema
  })
  .superRefine((sync, ctx) => {
    if (
      sync.destinationConfig.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne &&
      sync.syncOptions.syncSecretMetadataAsTags
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Syncing secret metadata is not supported with "Many-to-One" mapping behavior.'
      });
    }
  });

export const UpdateAwsSecretsManagerSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AWSSecretsManager,
  AwsSecretsManagerSyncOptionsConfig,
  AwsSecretsManagerSyncOptionsSchema
)
  .extend({
    destinationConfig: AwsSecretsManagerSyncDestinationConfigSchema.optional()
  })
  .superRefine((sync, ctx) => {
    if (
      sync.destinationConfig?.mappingBehavior === AwsSecretsManagerSyncMappingBehavior.ManyToOne &&
      sync.syncOptions.syncSecretMetadataAsTags
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Syncing secret metadata is not supported with "Many-to-One" mapping behavior.'
      });
    }
  });

export const AwsSecretsManagerSyncListItemSchema = z
  .object({
    name: z.literal("AWS Secrets Manager"),
    connection: z.literal(AppConnection.AWS),
    destination: z.literal(SecretSync.AWSSecretsManager),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AWSSecretsManager] }));
