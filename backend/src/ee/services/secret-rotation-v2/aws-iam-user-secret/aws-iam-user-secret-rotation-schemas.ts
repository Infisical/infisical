import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";

export const AwsIamUserSecretRotationGeneratedCredentialsSchema = z
  .object({
    accessKeyId: z.string(),
    secretAccessKey: z.string()
  })
  .array()
  .min(1)
  .max(2);

const AwsIamUserSecretRotationParametersSchema = z.object({
  userName: z
    .string()
    .trim()
    .min(1, "Client Name Required")
    .describe(SecretRotations.PARAMETERS.AWS_IAM_USER_SECRET.userName),
  region: z.nativeEnum(AWSRegion).describe(SecretRotations.PARAMETERS.AWS_IAM_USER_SECRET.region).optional()
});

const AwsIamUserSecretRotationSecretsMappingSchema = z.object({
  accessKeyId: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AWS_IAM_USER_SECRET.accessKeyId),
  secretAccessKey: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.AWS_IAM_USER_SECRET.secretAccessKey)
});

export const AwsIamUserSecretRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string()
  })
});

export const AwsIamUserSecretRotationSchema = BaseSecretRotationSchema(SecretRotation.AwsIamUserSecret).extend({
  type: z.literal(SecretRotation.AwsIamUserSecret),
  parameters: AwsIamUserSecretRotationParametersSchema,
  secretsMapping: AwsIamUserSecretRotationSecretsMappingSchema
});

export const CreateAwsIamUserSecretRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.AwsIamUserSecret
).extend({
  parameters: AwsIamUserSecretRotationParametersSchema,
  secretsMapping: AwsIamUserSecretRotationSecretsMappingSchema
});

export const UpdateAwsIamUserSecretRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.AwsIamUserSecret
).extend({
  parameters: AwsIamUserSecretRotationParametersSchema.optional(),
  secretsMapping: AwsIamUserSecretRotationSecretsMappingSchema.optional()
});

export const AwsIamUserSecretRotationListItemSchema = z.object({
  name: z.literal("AWS IAM User Secret"),
  connection: z.literal(AppConnection.AWS),
  type: z.literal(SecretRotation.AwsIamUserSecret),
  template: AwsIamUserSecretRotationTemplateSchema
});
