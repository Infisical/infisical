import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for the user-provided base name (matches backend schema). */
export const OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH = 100;

export const OpenAIAdminApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OpenAIAdminApiKey),
    parameters: z.object({
      name: z
        .string()
        .trim()
        .min(1, "Key name required")
        .max(
          OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH,
          `Key name must be ${OPENAI_ADMIN_API_KEY_NAME_MAX_LENGTH} characters or fewer`
        )
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
