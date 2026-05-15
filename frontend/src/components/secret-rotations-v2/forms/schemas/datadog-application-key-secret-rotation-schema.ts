import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const DatadogApplicationKeySecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DatadogApplicationKeySecret),
    parameters: z.object({
      serviceAccountId: z.string().trim().min(1, "Service Account required")
    }),
    secretsMapping: z.object({
      applicationKeyId: z.string().trim().min(1, "Application Key ID secret name required"),
      applicationKey: z.string().trim().min(1, "Application Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
