import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const RundeckSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Rundeck),
    destinationConfig: z.object({
      project: z.string().trim().min(1, "Project is required"),
      path: z.string().trim().min(1, "Path is required")
    })
  })
);
