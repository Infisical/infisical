import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ExternalInfisicalSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.ExternalInfisical),
    destinationConfig: z.object({
      projectId: z.string().trim().min(1, "Project ID is required"),
      environment: z.string().trim().min(1, "Environment slug is required"),
      secretPath: z.string().trim().min(1, "Secret path is required").default("/")
    })
  })
);
