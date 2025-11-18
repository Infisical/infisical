import { z } from "zod";

import { SecretSyncs } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  BaseSecretSyncSchema,
  GenericCreateSecretSyncFieldsSchema,
  GenericUpdateSecretSyncFieldsSchema
} from "@app/services/secret-sync/secret-sync-schemas";
import { TSyncOptionsConfig } from "@app/services/secret-sync/secret-sync-types";

import { SECRET_SYNC_NAME_MAP } from "../secret-sync-maps";

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

const pathCharacterValidator = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen
]);

const AwsParameterStoreSyncDestinationConfigSchema = z.object({
  region: z.nativeEnum(AWSRegion).describe(SecretSyncs.DESTINATION_CONFIG.AWS_PARAMETER_STORE.region),
  path: z
    .string()
    .trim()
    .min(1, "Parameter Store Path required")
    .max(2048, "Cannot exceed 2048 characters")
    .refine(
      (val) =>
        val.startsWith("/") &&
        val.endsWith("/") &&
        val
          .split("/")
          .filter(Boolean)
          .every((el) => pathCharacterValidator(el)),
      'Invalid path - must follow "/example/path/" format'
    )
    .describe(SecretSyncs.DESTINATION_CONFIG.AWS_PARAMETER_STORE.path)
});

const AwsParameterStoreSyncOptionsSchema = z.object({
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
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_PARAMETER_STORE.keyId),
  tags: z
    .object({
      key: z
        .string()
        .min(1, "Resource tag key required")
        .max(128, "Resource tag key cannot exceed 128 characters")
        .refine(
          (val) => tagFieldCharacterValidator(val),
          "Invalid resource tag key: keys can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
        ),
      value: z
        .string()
        .max(256, "Resource tag value cannot exceed 256 characters")
        .refine(
          (val) => tagFieldCharacterValidator(val),
          "Invalid resource tag value: tag values can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
        )
    })
    .array()
    .max(50)
    .refine((items) => new Set(items.map((item) => item.key)).size === items.length, {
      message: "Resource tag keys must be unique"
    })
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_PARAMETER_STORE.tags),
  syncSecretMetadataAsTags: z
    .boolean()
    .optional()
    .describe(SecretSyncs.ADDITIONAL_SYNC_OPTIONS.AWS_PARAMETER_STORE.syncSecretMetadataAsTags)
});

const AwsParameterStoreSyncOptionsConfig: TSyncOptionsConfig = { canImportSecrets: true };

export const AwsParameterStoreSyncSchema = BaseSecretSyncSchema(
  SecretSync.AWSParameterStore,
  AwsParameterStoreSyncOptionsConfig,
  AwsParameterStoreSyncOptionsSchema
)
  .extend({
    destination: z.literal(SecretSync.AWSParameterStore),
    destinationConfig: AwsParameterStoreSyncDestinationConfigSchema
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AWSParameterStore] }));

export const CreateAwsParameterStoreSyncSchema = GenericCreateSecretSyncFieldsSchema(
  SecretSync.AWSParameterStore,
  AwsParameterStoreSyncOptionsConfig,
  AwsParameterStoreSyncOptionsSchema
).extend({
  destinationConfig: AwsParameterStoreSyncDestinationConfigSchema
});

export const UpdateAwsParameterStoreSyncSchema = GenericUpdateSecretSyncFieldsSchema(
  SecretSync.AWSParameterStore,
  AwsParameterStoreSyncOptionsConfig,
  AwsParameterStoreSyncOptionsSchema
).extend({
  destinationConfig: AwsParameterStoreSyncDestinationConfigSchema.optional()
});

export const AwsParameterStoreSyncListItemSchema = z
  .object({
    name: z.literal("AWS Parameter Store"),
    connection: z.literal(AppConnection.AWS),
    destination: z.literal(SecretSync.AWSParameterStore),
    canImportSecrets: z.literal(true)
  })
  .describe(JSON.stringify({ title: SECRET_SYNC_NAME_MAP[SecretSync.AWSParameterStore] }));
