import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TriggerDevSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    markAsSecret: z.boolean().optional().default(true)
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.TriggerDev),
    destinationConfig: z.object({
      projectRef: z.string().trim().min(1, "Project required"),
      environment: z.string().trim().min(1, "Environment required")
    })
  })
);
