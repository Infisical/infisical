import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import {
  CloudflareTokenIpRestrictionSchema,
  CloudflareTokenNameSchema
} from "@app/ee/services/secret-rotation-v2/shared/cloudflare-token";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { CloudflareR2Jurisdiction } from "@app/services/app-connection/cloudflare/cloudflare-connection-enum";

export enum CloudflareR2AccessLevel {
  ObjectRead = "object-read",
  ObjectReadWrite = "object-read-write"
}

/** Cloudflare's own limit on R2 bucket names. */
const CLOUDFLARE_R2_BUCKET_NAME_MAX_LENGTH = 64;

/**
 * A bucket is identified by name *and* jurisdiction: the policy resource key is
 * `com.cloudflare.edge.r2.bucket.<accountId>_<jurisdiction>_<bucketName>`, and the same name can exist
 * in more than one jurisdiction.
 */
export const CloudflareR2BucketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bucket name required")
    .max(
      CLOUDFLARE_R2_BUCKET_NAME_MAX_LENGTH,
      `Bucket name must be ${CLOUDFLARE_R2_BUCKET_NAME_MAX_LENGTH} characters or fewer`
    ),
  jurisdiction: z.nativeEnum(CloudflareR2Jurisdiction).default(CloudflareR2Jurisdiction.Default)
});

export const CloudflareR2AccessKeyRotationGeneratedCredentialsSchema = z
  .object({
    // the underlying Cloudflare API token value, and the input to the secret access key hash
    apiToken: z.string(),
    // the API token's id — what R2's S3 API expects as the access key id, and what we delete on revoke
    accessKeyId: z.string(),
    // sha256 hex of `apiToken`
    secretAccessKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const CloudflareR2AccessKeyRotationParametersSchema = z.object({
  name: CloudflareTokenNameSchema.describe(SecretRotations.PARAMETERS.CLOUDFLARE_R2_ACCESS_KEY.name),
  buckets: CloudflareR2BucketSchema.array()
    .min(1, "At least one bucket is required")
    .superRefine((buckets, ctx) => {
      const keys = buckets.map(({ name, jurisdiction }) => `${jurisdiction}:${name}`);

      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Buckets must be unique"
        });
      }
    })
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_R2_ACCESS_KEY.buckets),
  accessLevel: z
    .nativeEnum(CloudflareR2AccessLevel)
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_R2_ACCESS_KEY.accessLevel),
  allowedIps: CloudflareTokenIpRestrictionSchema.array()
    .optional()
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_R2_ACCESS_KEY.allowedIps),
  disallowedIps: CloudflareTokenIpRestrictionSchema.array()
    .optional()
    .describe(SecretRotations.PARAMETERS.CLOUDFLARE_R2_ACCESS_KEY.disallowedIps)
});

const CloudflareR2AccessKeyRotationSecretsMappingSchema = z.object({
  apiToken: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLOUDFLARE_R2_ACCESS_KEY.apiToken),
  accessKeyId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLOUDFLARE_R2_ACCESS_KEY.accessKeyId),
  secretAccessKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.CLOUDFLARE_R2_ACCESS_KEY.secretAccessKey)
});

export const CloudflareR2AccessKeyRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    apiToken: z.string(),
    accessKeyId: z.string(),
    secretAccessKey: z.string()
  })
});

export const CloudflareR2AccessKeyRotationSchema = BaseSecretRotationSchema(
  SecretRotation.CloudflareR2AccessKey
).extend({
  type: z.literal(SecretRotation.CloudflareR2AccessKey),
  parameters: CloudflareR2AccessKeyRotationParametersSchema,
  secretsMapping: CloudflareR2AccessKeyRotationSecretsMappingSchema
});

export const CreateCloudflareR2AccessKeyRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.CloudflareR2AccessKey
).extend({
  parameters: CloudflareR2AccessKeyRotationParametersSchema,
  secretsMapping: CloudflareR2AccessKeyRotationSecretsMappingSchema
});

export const UpdateCloudflareR2AccessKeyRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.CloudflareR2AccessKey
).extend({
  parameters: CloudflareR2AccessKeyRotationParametersSchema.optional(),
  secretsMapping: CloudflareR2AccessKeyRotationSecretsMappingSchema.optional()
});

export const CloudflareR2AccessKeyRotationListItemSchema = z.object({
  name: z.literal("Cloudflare R2 Access Key"),
  connection: z.literal(AppConnection.Cloudflare),
  type: z.literal(SecretRotation.CloudflareR2AccessKey),
  template: CloudflareR2AccessKeyRotationTemplateSchema
});
