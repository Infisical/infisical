import { z } from "zod";

import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";

export const SqlCredentialsRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

export const SqlCredentialsRotationParametersSchema = z.object({
  username1: z
    .string()
    .trim()
    .min(1, "Username1 Required")
    .describe(SecretRotations.PARAMETERS.SQL_CREDENTIALS.username1),
  username2: z
    .string()
    .trim()
    .min(1, "Username2 Required")
    .describe(SecretRotations.PARAMETERS.SQL_CREDENTIALS.username2)
});

export const SqlCredentialsRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SQL_CREDENTIALS.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SQL_CREDENTIALS.password)
});

export const SqlCredentialsRotationTemplateSchema = z.object({
  createUserStatement: z.string(),
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});
