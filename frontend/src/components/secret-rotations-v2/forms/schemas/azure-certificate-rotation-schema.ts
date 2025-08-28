import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const AzureCertificateRotationSchema = z
  .object({
    type: z.literal(SecretRotation.AzureCertificate),
    parameters: z.object({
      objectId: z.string().trim().min(1, "Object ID required"),
      appName: z.string().trim().optional(),
      privateKey: z.string().trim().optional(),
      distinguishedName: z.string().trim().optional(),
      keyAlgorithm: z
        .enum(["RSA_2048", "RSA_4096", "ECDSA_P256", "ECDSA_P384"])
        .default("RSA_2048")
        .optional()
    }),
    secretsMapping: z.object({
      publicKey: z.string().trim().min(1, "Public Key required"),
      privateKey: z.string().trim().min(1, "Private Key required")
    })
  })
  .merge(BaseSecretRotationSchema);
