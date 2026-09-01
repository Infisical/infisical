import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const FireworksApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.FireworksApiKey),
    parameters: z.object({
      serviceAccountUserId: z.string().trim().min(1, "Service account required")
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API key name required")
    })
  })
  .merge(BaseSecretRotationSchema);
