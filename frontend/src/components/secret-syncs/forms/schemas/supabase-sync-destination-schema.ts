import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const SupabaseSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Supabase),
    destinationConfig: z.object({
      projectId: z.string().max(255).min(1, "Project ID is required"),
      projectName: z.string().max(255).min(1, "Project Name is required"),
      projectBranchId: z.string().max(255).optional(),
      projectBranchName: z.string().max(255).optional()
    })
  })
);
