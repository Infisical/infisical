import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const DatabricksServicePrincipalSecretRotationSchema = z
  .object({
    type: z.literal(SecretRotation.DatabricksServicePrincipalSecret),
    parameters: z.object({
      servicePrincipalId: z.string().trim().min(1, "Service Principal ID required"),
      servicePrincipalName: z.string().trim().optional(),
      clientId: z.string().trim().min(1, "Client ID required")
    }),
    secretsMapping: z.object({
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  })
  .merge(BaseSecretRotationSchema);
