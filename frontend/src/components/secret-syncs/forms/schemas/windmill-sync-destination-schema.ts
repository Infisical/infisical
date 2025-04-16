import { z } from "zod";

import { BaseSecretSyncSchema } from "@app/components/secret-syncs/forms/schemas/base-secret-sync-schema";
import { SecretSync } from "@app/hooks/api/secretSyncs";

export const WindmillSyncDestinationSchema = BaseSecretSyncSchema().merge(
  z.object({
    destination: z.literal(SecretSync.Windmill),
    destinationConfig: z.object({
      workspace: z.string().trim().min(1, "Workspace required"),
      path: z
        .string()
        .trim()
        .min(1, "Path required")
        .regex(
          /^([uf])\/([a-zA-Z0-9_-]+)(\/[a-zA-Z0-9_-]+)*\/$/,
          'Invalid path - must follow Windmill path format. ex: "f/folder/path/"'
        )
    })
  })
);
