import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.StripeApiKey),
    parameters: z.object({
      permissions: z.string().trim().array().min(1, "At least one permission is required"),
      connectPermissions: z.string().trim().array().optional()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
