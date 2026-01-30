import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CoolifySyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    autoRedeployServices: z.boolean().optional()
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.Coolify),
    destinationConfig: z.object({
      appId: z.string().trim().cuid2().min(1, "Application UUID required")
    })
  })
);
