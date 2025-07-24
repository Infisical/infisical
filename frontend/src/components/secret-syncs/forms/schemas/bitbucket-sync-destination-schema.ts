import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitbucketSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Bitbucket),
    destinationConfig: z.object({
      repositorySlug: z
        .string()
        .trim()
        .min(1, "Repository slug required")
        .describe("Repository slug"),
      environmentId: z.string().trim().optional().describe("Deployment environment uuid"),
      workspaceSlug: z.string().trim().min(1, "Workspace slug required").describe("Workspace slug")
    })
  })
);
