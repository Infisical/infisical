import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitbucketSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Bitbucket),
    destinationConfig: z.object({
      repository: z.string().trim().min(1, "Repository slug required").describe("Repository slug"),
      environment: z.string().trim().optional().describe("Deployment environment uuid"),
      workspace: z.string().trim().min(1, "Workspace slug required").describe("Workspace slug")
    })
  })
);
