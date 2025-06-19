import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const HerokuSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Heroku),
    destinationConfig: z.object({
      app: z.string().trim().min(1, "App ID required"),
      appName: z.string().trim().min(1, "App name required")
    })
  })
);
