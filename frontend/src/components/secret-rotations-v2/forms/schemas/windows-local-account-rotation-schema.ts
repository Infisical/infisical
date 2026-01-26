import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

// Windows local account username validation:
// - Must start with alphanumeric, underscore, or hyphen (not a period)
// - Can contain alphanumeric, underscore, hyphen, and period
// - Max 20 characters for local accounts
const WINDOWS_USERNAME_REGEX = /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/;

export const WindowsLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.WindowsLocalAccount),
    parameters: z.object({
      username: z
        .string()
        .trim()
        .min(1, "Username required")
        .max(20, "Username too long - Windows local accounts are limited to 20 characters")
        .refine(
          (val) => WINDOWS_USERNAME_REGEX.test(val),
          "Username must start with a letter, number, underscore, or hyphen"
        ),
      passwordRequirements: PasswordRequirementsSchema.optional(),
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
