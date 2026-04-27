import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TravisCISyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.TravisCI),
    destinationConfig: z.object({
      repositoryId: z.string().min(1, "Repository required"),
      repositorySlug: z.string().min(1, "Repository required"),
      branch: z.string().optional()
    })
  })
);
