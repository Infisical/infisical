import { z } from "zod";

import { SecretSync } from "@app/hooks/api/secretSyncs";

export const GcpSyncDestinationSchema = z.object({
  destination: z.literal(SecretSync.GCP),
  destinationConfig: z.object({
    projectId: z.string().min(1, "Project ID required")
  })
});
