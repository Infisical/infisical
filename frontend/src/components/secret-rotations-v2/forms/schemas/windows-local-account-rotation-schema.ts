import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import {
  containsDangerousSmbChars,
  SMB_USERNAME_REGEX,
  SMB_VALIDATION_LIMITS
} from "@app/helpers/smb";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

// Windows-specific password requirements schema that filters dangerous characters from allowedSymbols
const WindowsPasswordRequirementsSchema = PasswordRequirementsSchema.refine(
  (data) => {
    if (!data.allowedSymbols) return true;
    return !containsDangerousSmbChars(data.allowedSymbols);
  },
  {
    message: "Allowed symbols cannot contain the characters: ; | & ` $ ( ) or newlines",
    path: ["allowedSymbols"]
  }
);

export const WindowsLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.WindowsLocalAccount),
    parameters: z.object({
      username: z
        .string()
        .trim()
        .min(1, "Username required")
        .max(
          SMB_VALIDATION_LIMITS.MAX_WINDOWS_USERNAME_LENGTH,
          "Username too long - Windows local accounts are limited to 20 characters"
        )
        .refine((val) => SMB_USERNAME_REGEX.test(val), {
          message:
            "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
        })
        .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
          message: "Username cannot start with a hyphen or period, and cannot end with a period"
        }),
      passwordRequirements: WindowsPasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(WindowsLocalAccountRotationMethod).optional()
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().optional()
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
