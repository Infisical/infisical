import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH = 254;

export const GcpServiceAccountKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.GcpServiceAccountKey),
    parameters: z.object({
      serviceAccountEmail: z
        .string()
        .trim()
        .min(1, "Service Account Email required")
        .max(GCP_SERVICE_ACCOUNT_EMAIL_MAX_LENGTH)
        .email("Service Account Email must be a valid email address")
    }),
    secretsMapping: z.object({
      serviceAccountKey: z.string().trim().min(1, "Service Account Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
