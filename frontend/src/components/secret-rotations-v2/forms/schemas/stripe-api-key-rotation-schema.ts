import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const StripeApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.StripeApiKey),
    parameters: z.object({
      permissions: z.string().trim().array().min(1, "Grant at least one permission"),
      // A cleared field would otherwise send "", which the API rejects, instead of the default name.
      keyName: z
        .string()
        .trim()
        .max(80, "Key name must be 80 characters or fewer")
        .optional()
        .transform((keyName) => keyName || undefined)
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
