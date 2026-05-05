import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { GiteaSyncScope } from "@app/hooks/api/secretSyncs/types/gitea-sync";

export const GiteaSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Gitea),
    destinationConfig: z.object({
      scope: z.literal(GiteaSyncScope.Repository),
      owner: z.string().trim().min(1, "Repository owner is required"),
      repo: z.string().trim().min(1, "Repository name is required")
    })
  })
);
