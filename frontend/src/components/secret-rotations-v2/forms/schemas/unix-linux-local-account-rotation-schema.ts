import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { PasswordRequirementsSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { UnixLinuxLocalAccountRotationMethod } from "@app/hooks/api/secretRotationsV2/types/unix-linux-local-account-rotation";

export const UnixLinuxLocalAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.UnixLinuxLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username required"),
      passwordRequirements: PasswordRequirementsSchema.optional(),
      rotationMethod: z.nativeEnum(UnixLinuxLocalAccountRotationMethod).optional(),
      useSudo: z.boolean().default(false).optional()
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
