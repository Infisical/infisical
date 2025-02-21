import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AwsParameterStoreSyncDestinationSchema = BaseSecretSyncSchema(
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
    destination: z.literal(SecretSync.AWSParameterStore),
    destinationConfig: z.object({
      path: z
        .string()
        .trim()
        .min(1, "Parameter Store Path required")
        .max(2048, "Cannot exceed 2048 characters")
        .regex(/^\/([/]|(([\w-]+\/)+))?$/, 'Invalid path - must follow "/example/path/" format'),
      region: z.string().min(1, "Region required")
    })
  })
);
