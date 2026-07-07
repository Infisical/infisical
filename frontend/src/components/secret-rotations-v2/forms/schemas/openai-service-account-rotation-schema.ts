import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

/** Max length for the user-provided base name (matches backend schema). */
export const OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH = 100;

export const OpenAIServiceAccountRotationSchema = z
  .object({
    type: z.literal(SecretRotation.OpenAIServiceAccount),
    parameters: z.object({
      projectId: z.string().trim().min(1, "Project required"),
      name: z
        .string()
        .trim()
        .min(1, "Service account name required")
        .max(
          OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH,
          `Service account name must be ${OPENAI_SERVICE_ACCOUNT_NAME_MAX_LENGTH} characters or fewer`
        )
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
