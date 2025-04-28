import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const TeamCitySyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.TeamCity),
    destinationConfig: z.object({
      project: z.string().trim().min(1, "Project required"),
      buildConfig: z.string().trim().optional()
    })
  })
);
