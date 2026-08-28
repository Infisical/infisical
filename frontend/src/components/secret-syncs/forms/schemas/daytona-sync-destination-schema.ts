import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DaytonaSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Daytona),
    destinationConfig: z.object({
      organizationName: z
        .string()
        .trim()
        .min(1, "Daytona organization name required")
        .max(255, "Daytona organization name cannot exceed 255 characters")
    })
  })
);
