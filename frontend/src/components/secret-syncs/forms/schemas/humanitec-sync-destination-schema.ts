import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HumanitecSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Humanitec),
    destinationConfig: z.object({
      org: z.string().trim().min(1, "Organization required"),
      app: z.string().trim().min(1, "App required"),
      env: z.string().trim().min(1, "Environment required")
    })
  })
);
