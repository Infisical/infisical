import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const FireworksApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.FireworksApiKey),
    parameters: z.object({
      keyName: z.string().trim().min(1, "Key name required")
    }),
    secretsMapping: z.object({
      secretValue: z.string().trim().min(1, "Secret value name required")
    })
  })
  .merge(BaseSecretRotationSchema);
