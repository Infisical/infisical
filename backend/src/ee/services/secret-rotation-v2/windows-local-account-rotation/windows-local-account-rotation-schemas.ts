import { z } from "zod";

import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import {
  BaseCreateSecretRotationSchema,
  BaseSecretRotationSchema,
  BaseUpdateSecretRotationSchema
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-schemas";
import { PasswordRequirementsSchema } from "@app/ee/services/secret-rotation-v2/shared/general";
import { SecretRotations } from "@app/lib/api-docs";
import {
  containsDangerousSmbChars,
  SMB_VALIDATION_LIMITS,
  validateSmbPassword,
  validateWindowsUsername
} from "@app/lib/validator/validate-smb";
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

// Windows-specific password requirements schema that validates allowedSymbols
// doesn't contain dangerous characters that could cause command injection
const WindowsPasswordRequirementsSchema = PasswordRequirementsSchema.refine(
  (data) => {
    if (!data.allowedSymbols) return true;
    return !containsDangerousSmbChars(data.allowedSymbols);
  },
  {
    message: "Allowed symbols cannot contain dangerous characters: ; | & ` $ ( )",
    path: ["allowedSymbols"]
  }
);

// Built-in Windows accounts that should never have their passwords rotated
const WINDOWS_PRIVILEGED_ACCOUNTS = ["administrator", "system", "guest", "defaultaccount"];

const WindowsLocalAccountRotationParametersSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(
      SMB_VALIDATION_LIMITS.MAX_WINDOWS_USERNAME_LENGTH,
      "Username too long - Windows local accounts are limited to 20 characters"
    )
    .refine((val) => validateWindowsUsername(val), {
      message: "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
    })
    .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
      message: "Username cannot start with a hyphen or period, and cannot end with a period"
    })
    .refine((val) => !WINDOWS_PRIVILEGED_ACCOUNTS.includes(val.toLowerCase()), {
      message: "Cannot rotate passwords for privileged system accounts (Administrator, SYSTEM, Guest, DefaultAccount)"
    })
    .describe(SecretRotations.PARAMETERS.WINDOWS_LOCAL_ACCOUNT.username),
  passwordRequirements: WindowsPasswordRequirementsSchema.optional(),
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
        password: z
          .string()
          .refine((val) => !val || validateSmbPassword(val), {
            message: "Password cannot contain dangerous characters: ; | & ` $ ( ) or newlines"
          })
          .optional()
          .describe(SecretRotations.PARAMETERS.WINDOWS_LOCAL_ACCOUNT.password)
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
