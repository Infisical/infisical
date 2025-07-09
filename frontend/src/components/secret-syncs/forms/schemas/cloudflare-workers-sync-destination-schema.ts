import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflareWorkersSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.CloudflareWorkers),
    destinationConfig: z.object({
      scriptId: z.string().trim().min(1, "Script ID is required")
    })
  })
);
