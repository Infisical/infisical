import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SshPasswordRotationMethod } from "@app/hooks/api/secretRotationsV2/types/ssh-password-rotation";

export const SshPasswordRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SshPassword),
    parameters: z.object({
      username: z.string().trim().min(1, "Username required"),
      passwordRequirements: PasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(SshPasswordRotationMethod).optional()
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().min(1, "Password required")
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);
