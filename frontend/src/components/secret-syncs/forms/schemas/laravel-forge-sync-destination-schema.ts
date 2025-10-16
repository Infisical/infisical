import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const LaravelForgeSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.LaravelForge),
    destinationConfig: z.object({
      orgSlug: z.string().trim().min(1, "Org Slug required"),
      orgName: z.string().trim().min(1, "Org Name required"),
      serverId: z.string().trim().min(1, "Server ID required"),
      serverName: z.string().trim().min(1, "Server Name required"),
      siteId: z.string().trim().min(1, "Site ID required"),
      siteName: z.string().trim().min(1, "Site Name required")
    })
  })
);
