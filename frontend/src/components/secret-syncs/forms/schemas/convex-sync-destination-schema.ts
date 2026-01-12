import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const ConvexSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Convex),
    destinationConfig: z.object({
      deploymentUrl: z.string().trim().url("Deployment URL must be a valid URL")
    })
  })
);
