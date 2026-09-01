import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HasuraCloudSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.HasuraCloud),
    destinationConfig: z.object({
      projectId: z.string().min(1, "Project is required"),
      projectName: z.string()
    })
  })
);
