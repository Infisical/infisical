import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AwsIamUserSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.AwsIamUserSecret),
    parameters: z.object({
      userName: z.string().trim().min(1, "User Name required"),
      region: z.string().trim().optional()
    }),
    secretsMapping: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
    })
  })
  .merge(BaseSecretRotationSchema);
