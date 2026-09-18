import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const ConvexAccessKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.ConvexAccessKey),
    parameters: z.object({
      namePrefix: z.string().trim().min(1, "Name Prefix required")
    }),
    secretsMapping: z.object({
      accessKey: z.string().trim().min(1, "Access Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
