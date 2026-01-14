import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export enum SshPasswordRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export const SshPasswordRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const SshPasswordRotationParametersSchema = z.object({
  username: z.string().trim().min(1, "Username required").describe(SecretRotations.PARAMETERS.SSH_PASSWORD.username),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotationMethod: z
    .nativeEnum(SshPasswordRotationMethod)
    .optional()
    .describe(SecretRotations.PARAMETERS.SSH_PASSWORD.rotationMethod)
});

const SshPasswordRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SSH_PASSWORD.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.SSH_PASSWORD.password)
});

export const SshPasswordRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});

export const SshPasswordRotationSchema = BaseSecretRotationSchema(SecretRotation.SshPassword).extend({
  type: z.literal(SecretRotation.SshPassword),
  parameters: SshPasswordRotationParametersSchema,
  secretsMapping: SshPasswordRotationSecretsMappingSchema
});

export const CreateSshPasswordRotationSchema = BaseCreateSecretRotationSchema(SecretRotation.SshPassword)
  .extend({
    parameters: SshPasswordRotationParametersSchema,
    secretsMapping: SshPasswordRotationSecretsMappingSchema,
    temporaryParameters: z
      .object({
        password: z.string().min(1, "Password required").describe(SecretRotations.PARAMETERS.SSH_PASSWORD.password)
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    // Password is required for both rotation methods during initial setup
    // Self rotation: needed to authenticate as the user
    if (
      val.parameters.rotationMethod === SshPasswordRotationMethod.LoginAsTarget &&
      !val.temporaryParameters?.password
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required for initial rotation setup in login as root method",
        path: ["temporaryParameters", "password"]
      });
    }
  });

export const UpdateSshPasswordRotationSchema = BaseUpdateSecretRotationSchema(SecretRotation.SshPassword).extend({
  parameters: SshPasswordRotationParametersSchema.optional(),
  secretsMapping: SshPasswordRotationSecretsMappingSchema.optional()
});

export const SshPasswordRotationListItemSchema = z.object({
  name: z.literal("SSH Password"),
  connection: z.literal(AppConnection.SSH),
  type: z.literal(SecretRotation.SshPassword),
  template: SshPasswordRotationTemplateSchema
});
