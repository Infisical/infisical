import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export enum WindowsLocalAccountRotationMethod {
  LoginAsTarget = "login-as-target",
  LoginAsRoot = "login-as-root"
}

export const WindowsLocalAccountRotationGeneratedCredentialsSchema = z
  .object({
    username: z.string(),
    password: z.string()
  })
  .array()
  .min(1)
  .max(2);

const WindowsLocalAccountRotationParametersSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .refine(
      (val) => characterValidator([CharacterType.AlphaNumeric, CharacterType.Hyphen, CharacterType.Underscore])(val),
      "Name can only contain alphanumeric characters, dashes, underscores, and spaces"
    )
    .describe(SecretRotations.PARAMETERS.WINDOWS_LOCAL_ACCOUNT.username),
  passwordRequirements: PasswordRequirementsSchema.optional(),
  rotationMethod: z
    .nativeEnum(WindowsLocalAccountRotationMethod)
    .optional()
    .describe(SecretRotations.PARAMETERS.WINDOWS_LOCAL_ACCOUNT.rotationMethod)
});

const WindowsLocalAccountRotationSecretsMappingSchema = z.object({
  username: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.WINDOWS_LOCAL_ACCOUNT.username),
  password: SecretNameSchema.describe(SecretRotations.SECRETS_MAPPING.WINDOWS_LOCAL_ACCOUNT.password)
});

export const WindowsLocalAccountRotationTemplateSchema = z.object({
  secretsMapping: z.object({
    username: z.string(),
    password: z.string()
  })
});

export const WindowsLocalAccountRotationSchema = BaseSecretRotationSchema(SecretRotation.WindowsLocalAccount).extend({
  type: z.literal(SecretRotation.WindowsLocalAccount),
  parameters: WindowsLocalAccountRotationParametersSchema,
  secretsMapping: WindowsLocalAccountRotationSecretsMappingSchema
});

export const CreateWindowsLocalAccountRotationSchema = BaseCreateSecretRotationSchema(
  SecretRotation.WindowsLocalAccount
)
  .extend({
    parameters: WindowsLocalAccountRotationParametersSchema,
    secretsMapping: WindowsLocalAccountRotationSecretsMappingSchema,
    temporaryParameters: z
      .object({
        password: z.string().optional().describe(SecretRotations.PARAMETERS.WINDOWS_LOCAL_ACCOUNT.password)
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    if (
      val.parameters.rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget &&
      !val.temporaryParameters?.password
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current password is required for initial rotation setup in login as target method",
        path: ["temporaryParameters", "password"]
      });
    }
  });

export const UpdateWindowsLocalAccountRotationSchema = BaseUpdateSecretRotationSchema(
  SecretRotation.WindowsLocalAccount
).extend({
  parameters: WindowsLocalAccountRotationParametersSchema.optional(),
  secretsMapping: WindowsLocalAccountRotationSecretsMappingSchema.optional()
});

export const WindowsLocalAccountRotationListItemSchema = z.object({
  name: z.literal("Windows Local Account"),
  connection: z.literal(AppConnection.SMB),
  type: z.literal(SecretRotation.WindowsLocalAccount),
  template: WindowsLocalAccountRotationTemplateSchema
});
