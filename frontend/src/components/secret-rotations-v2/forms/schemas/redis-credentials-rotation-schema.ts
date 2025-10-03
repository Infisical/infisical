import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { PasswordRequirementsSchema } from "./shared";

export const RedisCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.RedisCredentials),
    parameters: z.object({
      passwordRequirements: PasswordRequirementsSchema.optional(),
      permissionScope: z.string().trim().min(1, "Permission scope is required")
    }),
    secretsMapping: z.object({
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  })
  .merge(BaseSecretRotationSchema);
