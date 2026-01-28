import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { OpenRouterLimitReset } from "@app/hooks/api/secretRotationsV2/types/open-router-api-key-rotation";

export const OpenRouterApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OpenRouterApiKey),
    parameters: z.object({
      name: z.string().trim().min(1, "Key name required"),
      limit: z.number().positive().optional().nullable(),
      limitReset: z.nativeEnum(OpenRouterLimitReset).optional().nullable(),
      includeByokInLimit: z.boolean().optional().nullable()
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
