import { z } from "zod";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { HpIloRotationMethod } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";

import { PasswordRequirementsSchema } from "./shared/password-requirements-schema";
import { BaseSecretRotationSchema } from "./base-secret-rotation-v2-schema";

export const HpIloRotationSchema = z
  .object({
    type: z.literal(SecretRotation.HpIloLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username is required"),
      rotationMethod: z.nativeEnum(HpIloRotationMethod).optional(),
      passwordRequirements: PasswordRequirementsSchema.optional()
    }),
    secretsMapping: z.object({
      username: z.string().min(1, "Username mapping is required"),
      password: z.string().min(1, "Password mapping is required")
    }),
    temporaryParameters: z
      .object({
        password: z.string().optional()
      })
      .optional()
  })
  .merge(BaseSecretRotationSchema);

export type THpIloRotationForm = z.infer<typeof HpIloRotationSchema>;
