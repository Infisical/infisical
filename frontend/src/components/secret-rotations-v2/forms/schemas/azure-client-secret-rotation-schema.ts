import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AzureClientSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.AzureClientSecret),
    parameters: z.object({
      objectId: z.string().trim().min(1, "Object ID required"),
      appName: z.string().trim().min(1, "App Name required"),
      clientId: z.string().trim().min(1, "Client ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
