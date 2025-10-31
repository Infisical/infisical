import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const NorthflankSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Northflank),
    destinationConfig: z.object({
      projectId: z.string().trim().min(1, "Project ID is required"),
      projectName: z.string().trim().optional(),
      secretGroupId: z.string().trim().min(1, "Secret Group ID is required"),
      secretGroupName: z.string().trim().optional()
    })
  })
);
