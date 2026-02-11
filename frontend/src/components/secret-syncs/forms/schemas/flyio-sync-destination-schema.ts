import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const FlyioSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    autoRedeploy: z.boolean().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.Flyio),
    destinationConfig: z.object({
      appId: z.string().trim().min(1, "App ID required")
    })
  })
);
