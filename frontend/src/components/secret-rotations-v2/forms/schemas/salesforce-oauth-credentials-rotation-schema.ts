import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SalesforceOauthCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SalesforceOauthCredentials),
    parameters: z.object({
      appId: z.string().trim().min(1, "App required"),
      appName: z.string().trim().min(1, "App required")
    }),
    secretsMapping: z.object({
      consumerKey: z.string().trim().min(1, "Consumer Key required"),
      consumerSecret: z.string().trim().min(1, "Consumer Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
