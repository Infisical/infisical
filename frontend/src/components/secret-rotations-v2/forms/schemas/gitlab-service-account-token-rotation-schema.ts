import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import {
  GitLabTokenRotationIntervalSchema,
  GitLabTokenRotationParametersSchema,
  GitLabTokenRotationSecretsMappingSchema
} from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const GitLabServiceAccountTokenRotationSchema = z
  .object({
    type: z.literal(SecretRotation.GitLabServiceAccountToken),
    parameters: GitLabTokenRotationParametersSchema.extend({
      serviceAccountId: z.string().trim().min(1, "Service account required")
    }),
    secretsMapping: GitLabTokenRotationSecretsMappingSchema
  })
  .merge(BaseSecretRotationSchema)
  .extend({ rotationInterval: GitLabTokenRotationIntervalSchema });
