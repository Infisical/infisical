import { z } from "zod";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { HpIloRotationMethod } from "@app/hooks/api/secretRotationsV2/types/hp-ilo-rotation";

import { PasswordRequirementsSchema } from "./shared/password-requirements-schema";
import { BaseSecretRotationSchema } from "./base-secret-rotation-v2-schema";

// iLO rejects longer passwords with iLO.2.43.InvalidPasswordLength
export const HP_ILO_MAX_PASSWORD_LENGTH = 39;

export const HpIloRotationSchema = z
  .object({
    type: z.literal(SecretRotation.HpIloLocalAccount),
    parameters: z.object({
      username: z.string().trim().min(1, "Username is required"),
      rotationMethod: z.nativeEnum(HpIloRotationMethod).optional(),
      sslRejectUnauthorized: z.boolean().optional(),
      passwordRequirements: PasswordRequirementsSchema.refine(
        (requirements) => requirements.length <= HP_ILO_MAX_PASSWORD_LENGTH,
        {
          message: `Password length cannot exceed ${HP_ILO_MAX_PASSWORD_LENGTH} characters, the maximum HP iLO accepts`,
          path: ["length"]
        }
      ).optional()
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
