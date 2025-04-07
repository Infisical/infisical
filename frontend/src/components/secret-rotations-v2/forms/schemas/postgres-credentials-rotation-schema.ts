import { z } from "zod";

import { BaseSecretRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/base-secret-rotation-v2-schema";
import { SqlCredentialsRotationSchema } from "@app/components/secret-rotations-v2/forms/schemas/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const PostgresCredentialsRotationSchema = z
  .object({
    type: z.literal(SecretRotation.PostgresCredentials)
  })
  .merge(SqlCredentialsRotationSchema)
  .merge(BaseSecretRotationSchema);
