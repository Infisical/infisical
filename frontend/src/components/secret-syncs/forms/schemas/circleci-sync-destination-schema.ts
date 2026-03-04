import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const CircleCISyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.CircleCI),
    destinationConfig: z.object({
      orgName: z.string().trim().min(1, "Organization is required"),
      projectName: z.string().trim().min(1, "Project is required"),
      projectId: z.string().trim().min(1, "Project ID is required")
    })
  })
);
