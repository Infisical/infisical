import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const AzureDevOpsSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.AzureDevOps),
    destinationConfig: z.object({
      devopsProjectId: z.string().trim().min(1, { message: "Azure DevOps Project ID is required" }),
      devopsProjectName: z.string().trim().optional()
    })
  })
);
