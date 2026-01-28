import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

// Windows local account username validation:
// - Cannot start with a period or hyphen
// - Cannot end with a period
// - Can contain alphanumeric, underscore, hyphen, and period
// - Max 20 characters for local accounts
const WINDOWS_USERNAME_REGEX = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/;

// Dangerous characters that could enable command/RPC injection in Windows/SMB context
// - Command separators: ; | &
// - Command substitution: ` $ ( )
// - Newlines: \n \r (auth file directive injection)
// - Null bytes: \0 (string termination attacks)
const DANGEROUS_SMB_PASSWORD_CHARS = [";", "|", "&", "`", "$", "(", ")", "\n", "\r", "\0"];

// Windows-specific password requirements schema that filters dangerous characters from allowedSymbols
const WindowsPasswordRequirementsSchema = PasswordRequirementsSchema.refine(
  (data) => {
    if (!data.allowedSymbols) return true;
    return !DANGEROUS_SMB_PASSWORD_CHARS.some((char) => data.allowedSymbols?.includes(char));
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
        .max(20, "Username too long - Windows local accounts are limited to 20 characters")
        .refine((val) => WINDOWS_USERNAME_REGEX.test(val), {
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
