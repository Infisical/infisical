import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { WindowsLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/windows-local-account-rotation";

export const WindowsLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.WindowsLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username required"),
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
