import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const Cloud66SyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Cloud66),
    destinationConfig: z.object({
      stackId: z.string().trim().min(1, "Stack ID required"),
      stackName: z.string().trim().min(1, "Stack name required")
    })
  })
);
