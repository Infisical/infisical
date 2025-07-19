import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const DigitalOceanAppPlatformSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.DigitalOceanAppPlatform),
    destinationConfig: z.object({
      appId: z
        .string()
        .min(1, "App ID is required")
        .max(255, "App ID must be less than 255 characters"),
      appName: z
        .string()
        .min(1, "Account Name is required")
        .max(255, "App Name must be less than 255 characters")
    })
  })
);
