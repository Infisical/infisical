import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const RailwaySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Railway),
    destinationConfig: z.object({
      projectId: z.string().min(1, "Project ID is required"),
      projectName: z.string(),
      environmentName: z.string(),
      environmentId: z.string().min(1, "Environment is required"),
      serviceId: z.string().optional(),
      serviceName: z.string().optional()
    })
  })
);
