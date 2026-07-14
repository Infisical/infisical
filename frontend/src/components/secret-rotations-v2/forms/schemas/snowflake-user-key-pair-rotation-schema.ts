import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SnowflakeUserKeyPairRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SnowflakeUserKeyPair),
    parameters: z.object({
      username: z.string().trim().min(1, "User required")
    }),
    secretsMapping: z.object({
      privateKey: z.string().trim().min(1, "Private Key required"),
      publicKey: z.string().trim().min(1, "Public Key required")
    })
  })
  .merge(BaseSecretRotationSchema);
