import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { AwsSecretsManagerSyncMappingBehavior } from "@app/hooks/api/secretSyncs/types/aws-secrets-manager-sync";

export const AwsSecretsManagerSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    keyId: z.string().optional(),
    tags: z
      .object({
        key: z
          .string()
          .regex(
            /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u,
            "Keys can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
          )
          .min(1, "Key required")
          .max(128, "Tag key cannot exceed 128 characters"),
        value: z
          .string()
          .regex(
            /^([\p{L}\p{Z}\p{N}_.:/=+\-@]*)$/u,
            "Values can only contain Unicode letters, digits, white space and any of the following: _.:/=+@-"
          )
          .max(256, "Tag value cannot exceed 256 characters")
      })
      .array()
      .max(50)
      .optional(),
    syncSecretMetadataAsTags: z.boolean().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.AWSSecretsManager),
    destinationConfig: z
      .discriminatedUnion("mappingBehavior", [
        z.object({
          mappingBehavior: z.literal(AwsSecretsManagerSyncMappingBehavior.OneToOne)
        }),
        z.object({
          mappingBehavior: z.literal(AwsSecretsManagerSyncMappingBehavior.ManyToOne),
          secretName: z
            .string()
            .regex(
              /^[a-zA-Z0-9/_+=.@-]+$/,
              "Secret name must contain only alphanumeric characters and the characters /_+=.@-"
            )
            .min(1, "Secret name is required")
            .max(256, "Secret name cannot exceed 256 characters")
        })
      ])
      .and(
        z.object({
          region: z.string().min(1, "Region required")
        })
      )
  })
);
