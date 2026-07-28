import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SpaceliftSyncDestinationSchema = BaseSecretSyncSchema(
  z.object({
    writeOnly: z.boolean().optional().default(false)
  })
).merge(
  z.object({
    destination: z.literal(SecretSync.Spacelift),
    destinationConfig: z.object({
      contextId: z.string().trim().min(1, "Context ID required"),
      contextName: z.string().trim().min(1, "Context name required")
    })
  })
);
