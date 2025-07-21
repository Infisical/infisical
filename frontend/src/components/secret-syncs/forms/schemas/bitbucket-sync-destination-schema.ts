import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const BitbucketSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Bitbucket),
    destinationConfig: z.object({
      repository: z.string().trim().describe("Repository Name"),
      environment: z.string().trim().optional().describe("Environment Name"),
      workspace: z.string().trim().describe("Workspace Name")
    })
  })
);
