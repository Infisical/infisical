import { z } from "zod";

import { PamResource } from "../pam-resource-enums";
import {
  BaseCreatePamAccountSchema,
  BaseCreatePamResourceSchema,
  BasePamAccountSchema,
  BasePamAccountSchemaWithResource,
  BasePamResourceSchema,
  BaseUpdatePamAccountSchema,
  BaseUpdatePamResourceSchema
} from "../pam-resource-schemas";

// AWS STS session duration limits (in seconds)
// Role chaining (Infisical → PAM role → target role) limits max session to 1 hour
// @see https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html
const AWS_STS_MIN_SESSION_DURATION = 900; // 15 minutes
const AWS_STS_MAX_SESSION_DURATION_ROLE_CHAINING = 3600; // 1 hour

export const AwsIamResourceConnectionDetailsSchema = z.object({
  region: z.string().trim().min(1),
  roleArn: z.string().trim().min(1)
});

export const AwsIamAccountCredentialsSchema = z.object({
  targetRoleArn: z.string().trim().min(1).max(2048),
  maxSessionDuration: z.coerce
    .number()
    .min(AWS_STS_MIN_SESSION_DURATION)
    .max(AWS_STS_MAX_SESSION_DURATION_ROLE_CHAINING)
});

const BaseAwsIamResourceSchema = BasePamResourceSchema.extend({
  resourceType: z.literal(PamResource.AwsIam),
  gatewayId: z.string().uuid().nullable().optional()
});

export const AwsIamResourceSchema = BaseAwsIamResourceSchema.extend({
  connectionDetails: AwsIamResourceConnectionDetailsSchema,
  rotationAccountCredentials: AwsIamAccountCredentialsSchema.nullable().optional()
});

export const SanitizedAwsIamResourceSchema = BaseAwsIamResourceSchema.extend({
  connectionDetails: AwsIamResourceConnectionDetailsSchema,
  rotationAccountCredentials: AwsIamAccountCredentialsSchema.nullable().optional()
});

export const AwsIamResourceListItemSchema = z.object({
  name: z.literal("AWS IAM"),
  resource: z.literal(PamResource.AwsIam)
});

export const CreateAwsIamResourceSchema = BaseCreatePamResourceSchema.extend({
  connectionDetails: AwsIamResourceConnectionDetailsSchema,
  gatewayId: z.string().uuid().nullable().optional(),
  rotationAccountCredentials: AwsIamAccountCredentialsSchema.nullable().optional()
});

export const UpdateAwsIamResourceSchema = BaseUpdatePamResourceSchema.extend({
  connectionDetails: AwsIamResourceConnectionDetailsSchema.optional(),
  gatewayId: z.string().uuid().nullable().optional(),
  rotationAccountCredentials: AwsIamAccountCredentialsSchema.nullable().optional()
});

export const AwsIamAccountSchema = BasePamAccountSchema.extend({
  credentials: AwsIamAccountCredentialsSchema
});

export const CreateAwsIamAccountSchema = BaseCreatePamAccountSchema.extend({
  credentials: AwsIamAccountCredentialsSchema
});

export const UpdateAwsIamAccountSchema = BaseUpdatePamAccountSchema.extend({
  credentials: AwsIamAccountCredentialsSchema.optional()
});

export const SanitizedAwsIamAccountWithResourceSchema = BasePamAccountSchemaWithResource.extend({
  credentials: AwsIamAccountCredentialsSchema.pick({
    targetRoleArn: true,
    maxSessionDuration: true
  })
});
