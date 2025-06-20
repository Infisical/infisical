import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CloudflarePagesSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.CloudflarePages),
    destinationConfig: z.object({
      projectName: z.string().trim().min(1, "Project name is required"),
      environment: z.string().trim().min(1, "Environment is required")
    })
  })
);
