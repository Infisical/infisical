import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SupabaseApiKeyType } from "@app/hooks/api/secretRotationsV2/types/supabase-api-key-rotation";

export const SupabaseApiKeyRotationSchema = z
  .object({
    type: z.literal(SecretRotation.SupabaseApiKey),
    parameters: z.object({
      projectRef: z.string().trim().min(1, "Project reference required"),
      keyType: z.nativeEnum(SupabaseApiKeyType)
    }),
    secretsMapping: z.object({
      apiKey: z.string().trim().min(1, "API Key secret name required")
    })
  })
  .merge(BaseSecretRotationSchema);
